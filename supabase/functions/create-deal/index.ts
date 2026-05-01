/**
 * supabase/functions/create-deal/index.ts
 *
 * Authoritative backend handler for deal creation.
 * Any authenticated user can create a deal (created_by is set to their id).
 * Auto-sets probability from stage if not provided.
 *
 * Deploy: supabase functions deploy create-deal
 */

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z }            from 'https://deno.land/x/zod@v3.22.4/mod.ts';

// ── Schema ─────────────────────────────────────────────────────────────────────

const DEAL_STAGES = ['new_lead','contacted','meeting_scheduled','proposal','negotiation','won','lost'] as const;

const CreateDealSchema = z.object({
  title:               z.string().min(2, 'Title too short').max(200).trim(),
  value:               z.number().min(0, 'Value cannot be negative').default(0),
  stage:               z.enum(DEAL_STAGES),
  probability:         z.number().min(0).max(100).optional(),
  expected_close_date: z.string().optional().nullable(),
  lead_id:             z.string().uuid().optional().nullable(),
});

// ── Stage → auto probability ───────────────────────────────────────────────────

const STAGE_PROB: Record<string, number> = {
  new_lead: 10, contacted: 25, meeting_scheduled: 40,
  proposal: 60, negotiation: 80, won: 100, lost: 0,
};

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

// ── Handler ────────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
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
    try { body = await req.json(); }
    catch { return json({ error: 'Invalid JSON body' }, 400); }

    const parsed = CreateDealSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: 'Validation error', details: parsed.error.issues }, 400);
    }

    const input = parsed.data;

    // ── 3. Get organization_id ───────────────────────────────────────────────
    const { data: profile } = await adminClient
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    // ── 4. Insert deal ───────────────────────────────────────────────────────
    const probability = input.probability ?? STAGE_PROB[input.stage];

    const { data: deal, error: insertError } = await adminClient
      .from('deals')
      .insert([{
        title:               input.title,
        value:               input.value,
        stage:               input.stage,
        probability,
        expected_close_date: input.expected_close_date || null,
        lead_id:             input.lead_id ?? null,
        created_by:          user.id,
        organization_id:     profile?.organization_id ?? null,
      }])
      .select()
      .single();

    if (insertError) {
      console.error('[create-deal] Insert error:', insertError.message);
      return json({ error: 'Database error' }, 500);
    }

    return json({ success: true, deal });

  } catch (err) {
    console.error('[create-deal] Unhandled error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});