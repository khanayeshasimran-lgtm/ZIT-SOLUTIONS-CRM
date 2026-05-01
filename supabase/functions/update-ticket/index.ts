/**
 * supabase/functions/update-ticket/index.ts
 *
 * Authoritative backend handler for ticket updates.
 *   admin / manager → can update any ticket
 *   user            → can only update tickets they created
 *
 * Deploy: supabase functions deploy update-ticket
 */

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z }            from 'https://deno.land/x/zod@v3.22.4/mod.ts';

// ── Schema ─────────────────────────────────────────────────────────────────────

const UpdateTicketSchema = z.object({
  ticketId:          z.string().uuid(),
  title:             z.string().min(3).max(150).trim().optional(),
  description:       z.string().max(2000).optional().nullable(),
  notes:             z.string().max(2000).optional().nullable(),
  priority:          z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  status:            z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
  category:          z.string().max(50).optional().nullable(),
  assigned_to_email: z.string().email().or(z.literal('')).optional(),
  github_issue_url:  z.string().url().or(z.literal('')).optional(),
  lead_id:           z.string().uuid().optional().nullable(),
  contact_id:        z.string().uuid().optional().nullable(),
  company_id:        z.string().uuid().optional().nullable(),
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

    const parsed = UpdateTicketSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: 'Validation error', details: parsed.error.issues }, 400);
    }

    const { ticketId, ...updates } = parsed.data;

    // ── 4. Load ticket + check ownership ────────────────────────────────────
    const { data: ticket, error: fetchError } = await adminClient
      .from('tickets')
      .select('id, created_by')
      .eq('id', ticketId)
      .single();

    if (fetchError || !ticket) return json({ error: 'Ticket not found' }, 404);

    const isOwner      = ticket.created_by === user.id;
    const isPrivileged = userRole === 'admin' || userRole === 'manager';

    if (!isOwner && !isPrivileged) {
      return json({ error: 'Forbidden — you can only edit tickets you created' }, 403);
    }

    // ── 5. Build payload ─────────────────────────────────────────────────────
    const payload: Record<string, unknown> = {};

    if (updates.title             !== undefined) payload.title             = updates.title?.trim();
    if (updates.description       !== undefined) payload.description       = updates.description || null;
    if (updates.notes             !== undefined) payload.notes             = updates.notes || null;
    if (updates.priority          !== undefined) payload.priority          = updates.priority;
    if (updates.status            !== undefined) payload.status            = updates.status;
    if (updates.category          !== undefined) payload.category          = updates.category || null;
    if (updates.assigned_to_email !== undefined) payload.assigned_to_email = updates.assigned_to_email || null;
    if (updates.github_issue_url  !== undefined) payload.github_issue_url  = updates.github_issue_url || null;
    if (updates.lead_id           !== undefined) payload.lead_id           = updates.lead_id;
    if (updates.contact_id        !== undefined) payload.contact_id        = updates.contact_id;
    if (updates.company_id        !== undefined) payload.company_id        = updates.company_id;

    if (Object.keys(payload).length === 0) {
      return json({ error: 'No fields to update' }, 400);
    }

    // ── 6. Update ────────────────────────────────────────────────────────────
    const { error: updateError } = await adminClient
      .from('tickets')
      .update(payload)
      .eq('id', ticketId);

    if (updateError) {
      console.error('[update-ticket] DB error:', updateError.message);
      return json({ error: 'Database error' }, 500);
    }

    return json({ success: true, ticketId });

  } catch (err) {
    console.error('[update-ticket] Unhandled error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});