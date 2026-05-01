/**
 * supabase/functions/delete-deal/index.ts
 *
 * Authoritative backend handler for deal deletion.
 *   admin / manager → can delete any deal
 *   user            → can only delete deals they created
 *
 * Uses soft delete (sets deleted_at) to preserve audit history.
 * Deploy: supabase functions deploy delete-deal
 */

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z }            from 'https://deno.land/x/zod@v3.22.4/mod.ts';

// ── Schema ─────────────────────────────────────────────────────────────────────

const DeleteDealSchema = z.object({
  dealId: z.string().uuid(),
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

    // ── 2. Load role from DB ─────────────────────────────────────────────────
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: profile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const userRole: string = profile?.role ?? 'user';

    // ── 3. Validate input ────────────────────────────────────────────────────
    let body: unknown;
    try { body = await req.json(); }
    catch { return json({ error: 'Invalid JSON body' }, 400); }

    const parsed = DeleteDealSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: 'Validation error', details: parsed.error.issues }, 400);
    }

    const { dealId } = parsed.data;

    // ── 4. Load deal + check ownership ──────────────────────────────────────
    const { data: deal, error: fetchError } = await adminClient
      .from('deals')
      .select('id, created_by, title')
      .eq('id', dealId)
      .single();

    if (fetchError || !deal) return json({ error: 'Deal not found' }, 404);

    const isOwner      = deal.created_by === user.id;
    const isPrivileged = userRole === 'admin' || userRole === 'manager';

    if (!isOwner && !isPrivileged) {
      return json({ error: 'Forbidden — you can only delete deals you created' }, 403);
    }

    // ── 5. Soft delete ───────────────────────────────────────────────────────
    const { error: deleteError } = await adminClient
      .from('deals')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', dealId);

    if (deleteError) {
      console.error('[delete-deal] DB error:', deleteError.message);
      return json({ error: 'Database error' }, 500);
    }

    return json({ success: true, dealId, dealTitle: deal.title });

  } catch (err) {
    console.error('[delete-deal] Unhandled error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});