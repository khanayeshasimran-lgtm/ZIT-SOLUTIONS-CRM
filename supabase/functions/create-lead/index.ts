/**
 * supabase/functions/create-lead/index.ts
 *
 * Authoritative backend handler for lead creation.
 * Includes: JWT validation, input sanitization, duplicate detection.
 *
 * Deploy: supabase functions deploy create-lead
 */

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z }            from 'https://deno.land/x/zod@v3.22.4/mod.ts';

// ── Schema ─────────────────────────────────────────────────────────────────────

const CreateLeadSchema = z.object({
  name:   z.string().min(2, 'Name too short').max(200).trim(),
  email:  z.string().email('Invalid email').optional().or(z.literal('')),
  phone:  z.string().min(6, 'Phone too short').max(30).optional().or(z.literal('')),
  source: z.string().max(100).optional(),
  status: z.enum(['new', 'contacted', 'qualified', 'unqualified']).default('new'),
});

// ── CORS ───────────────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin':  Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

// ── Levenshtein (for fuzzy duplicate check) ────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

// ── Handler ────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    // ── 1. Validate JWT ──────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Missing Authorization header' }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // ── 2. Validate input ────────────────────────────────────────────────────
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }

    const parsed = CreateLeadSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: 'Validation error', details: parsed.error.issues }, 400);
    }

    const input = parsed.data;

    // ── 3. Duplicate detection ───────────────────────────────────────────────
    const { data: existingLeads } = await adminClient
      .from('leads')
      .select('id, name, email, phone');

    const nameLower = input.name.toLowerCase().trim();

    const duplicates = (existingLeads ?? []).filter((lead: any) => {
      if (input.email && lead.email && lead.email.toLowerCase() === input.email.toLowerCase()) return true;
      if (input.phone && lead.phone && lead.phone === input.phone) return true;
      return levenshtein(nameLower, (lead.name ?? '').toLowerCase().trim()) <= 2;
    });

    if (duplicates.length > 0) {
      // Return warning (not error) — caller can choose to proceed
      return json({
        warning:    'Potential duplicate leads found',
        duplicates: duplicates.map((d: any) => ({ id: d.id, name: d.name, email: d.email })),
      }, 409);
    }

    // ── 4. Get organization_id ───────────────────────────────────────────────
    const { data: profile } = await adminClient
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    // ── 5. Insert lead ───────────────────────────────────────────────────────
    const { data: lead, error: insertError } = await adminClient
      .from('leads')
      .insert([{
        name:            input.name,
        email:           input.email || null,
        phone:           input.phone || null,
        source:          input.source || null,
        status:          'new',
        created_by:      user.id,
        organization_id: profile?.organization_id ?? null,
      }])
      .select()
      .single();

    if (insertError) {
      console.error('[create-lead] Insert error:', insertError.message);
      return json({ error: 'Database error' }, 500);
    }

    return json({ success: true, lead });

  } catch (err) {
    console.error('[create-lead] Unhandled error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});