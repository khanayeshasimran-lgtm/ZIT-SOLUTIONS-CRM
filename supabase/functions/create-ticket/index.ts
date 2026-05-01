/**
 * supabase/functions/create-ticket/index.ts
 *
 * Authoritative backend handler for ticket creation.
 * Any authenticated user can create a ticket.
 * Fires a notification via the send-email function after creation.
 *
 * Deploy: supabase functions deploy create-ticket
 */

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z }            from 'https://deno.land/x/zod@v3.22.4/mod.ts';

// ── Schema ─────────────────────────────────────────────────────────────────────

const CreateTicketSchema = z.object({
  title:             z.string().min(3, 'Title too short').max(150).trim(),
  description:       z.string().max(2000).optional().nullable(),
  notes:             z.string().max(2000).optional().nullable(),
  priority:          z.enum(['low', 'medium', 'high', 'urgent']),
  status:            z.enum(['open', 'in_progress', 'resolved', 'closed']).default('open'),
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

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // ── 2. Validate input ────────────────────────────────────────────────────
    let body: unknown;
    try { body = await req.json(); }
    catch { return json({ error: 'Invalid JSON body' }, 400); }

    const parsed = CreateTicketSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: 'Validation error', details: parsed.error.issues }, 400);
    }

    const input = parsed.data;

    // ── 3. Get organization_id ───────────────────────────────────────────────
    const { data: profile } = await adminClient
      .from('profiles')
      .select('organization_id, email')
      .eq('id', user.id)
      .single();

    // ── 4. Insert ticket ─────────────────────────────────────────────────────
    const { data: ticket, error: insertError } = await adminClient
      .from('tickets')
      .insert([{
        title:             input.title,
        description:       input.description || null,
        notes:             input.notes || null,
        priority:          input.priority,
        status:            input.status,
        category:          input.category || null,
        assigned_to_email: input.assigned_to_email || null,
        github_issue_url:  input.github_issue_url || null,
        lead_id:           input.lead_id ?? null,
        contact_id:        input.contact_id ?? null,
        company_id:        input.company_id ?? null,
        created_by:        user.id,
        organization_id:   profile?.organization_id ?? null,
      }])
      .select()
      .single();

    if (insertError) {
      console.error('[create-ticket] Insert error:', insertError.message);
      return json({ error: 'Database error' }, 500);
    }

    // ── 5. Fire notification (non-blocking) ──────────────────────────────────
    // Get company name if linked
    let companyName: string | undefined;
    if (input.company_id) {
      const { data: company } = await adminClient
        .from('companies')
        .select('name')
        .eq('id', input.company_id)
        .single();
      companyName = company?.name;
    }

    // Invoke send-email non-blocking — don't await, don't fail on error
    fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
      },
      body: JSON.stringify({
        event:   'new_ticket',
        subject: `New Ticket: ${input.title}`,
        body: [
          `A new support ticket has been submitted.`,
          ``,
          `Title:    ${input.title}`,
          `Priority: ${input.priority}`,
          companyName ? `Company:  ${companyName}` : '',
          `From:     ${profile?.email ?? user.email}`,
        ].filter(Boolean).join('\n'),
      }),
    }).catch(err => console.warn('[create-ticket] Notification failed:', err));

    return json({ success: true, ticket });

  } catch (err) {
    console.error('[create-ticket] Unhandled error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});