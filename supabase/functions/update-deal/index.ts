/**
 * supabase/functions/update-deal/index.ts
 *
 * Secure backend handler for deal updates + stage changes.
 *
 * Changes from original:
 *   ✅  All original logic preserved (JWT, role check, ownership, Zod validation)
 *   ✅  On stage change: fires run-automations instead of hardcoded follow-up creation
 *   ✅  CORS header now includes x-client-info (CORS fix from Tier 1)
 *
 * Deploy: supabase functions deploy update-deal
 */

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z }            from 'https://deno.land/x/zod@v3.22.4/mod.ts';

// ── Input schema ──────────────────────────────────────────────────────────────

const DEAL_STAGES = ['new_lead','contacted','meeting_scheduled','proposal','negotiation','won','lost'] as const;

const UpdateDealSchema = z.object({
  dealId:              z.string().uuid(),
  title:               z.string().min(2).max(200).optional(),
  value:               z.number().min(0).max(999_999_999).optional(),
  stage:               z.enum(DEAL_STAGES).optional(),
  probability:         z.number().min(0).max(100).optional(),
  expected_close_date: z.string().optional().nullable(),
});

type UpdateDealInput = z.infer<typeof UpdateDealSchema>;

// ── Stage → auto probability ──────────────────────────────────────────────────

const STAGE_PROB: Record<string, number> = {
  new_lead: 10, contacted: 25, meeting_scheduled: 40,
  proposal: 60, negotiation: 80, won: 100, lost: 0,
};

// ── CORS ──────────────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin':  Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

// ── Trigger automations (fire-and-forget, non-blocking) ───────────────────────

async function triggerAutomations(
  triggerType: 'deal_stage_change' | 'deal_won',
  organizationId: string,
  context: Record<string, unknown>,
  authHeader: string,
): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    await fetch(`${supabaseUrl}/functions/v1/run-automations`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': authHeader,
        'x-client-info': 'update-deal-internal',
      },
      body: JSON.stringify({
        trigger_type:    triggerType,
        organization_id: organizationId,
        context,
      }),
    });
    // Not awaiting response — fire and forget
  } catch (err) {
    // Never let automation failure break the deal update
    console.warn('[update-deal] automation trigger failed (non-blocking):', err);
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    // ── 1. Validate JWT ──────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Missing or invalid Authorization header' }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);

    // ── 2. Load role + org from DB ───────────────────────────────────────────
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: profile } = await adminClient
      .from('profiles')
      .select('role, organization_id')
      .eq('id', user.id)
      .single();

    const userRole: string       = profile?.role ?? 'user';
    const organizationId: string = profile?.organization_id ?? '';

    // ── 3. Validate input ────────────────────────────────────────────────────
    let body: unknown;
    try { body = await req.json(); }
    catch { return json({ error: 'Invalid JSON body' }, 400); }

    const parsed = UpdateDealSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: 'Validation error', details: parsed.error.issues }, 400);
    }

    const { dealId, ...updates }: UpdateDealInput = parsed.data;

    // ── 4. Load deal + check ownership ──────────────────────────────────────
    const { data: deal, error: dealFetchError } = await adminClient
      .from('deals')
      .select('id, created_by, stage, title, value')
      .eq('id', dealId)
      .single();

    if (dealFetchError || !deal) return json({ error: 'Deal not found' }, 404);

    const isOwner      = deal.created_by === user.id;
    const isPrivileged = userRole === 'admin' || userRole === 'manager';

    if (!isOwner && !isPrivileged) {
      return json({ error: 'Forbidden — you can only edit deals you created' }, 403);
    }

    // ── 5. Build update payload ──────────────────────────────────────────────
    const payload: Record<string, unknown> = {};

    if (updates.title               !== undefined) payload.title               = updates.title.trim();
    if (updates.value               !== undefined) payload.value               = updates.value;
    if (updates.expected_close_date !== undefined) payload.expected_close_date = updates.expected_close_date;

    if (updates.stage !== undefined) {
      payload.stage       = updates.stage;
      payload.probability = updates.probability ?? STAGE_PROB[updates.stage];
    } else if (updates.probability !== undefined) {
      payload.probability = updates.probability;
    }

    if (Object.keys(payload).length === 0) {
      return json({ error: 'No fields to update' }, 400);
    }

    payload.updated_at = new Date().toISOString();

    // ── 6. Perform update ────────────────────────────────────────────────────
    const { error: updateError } = await adminClient
      .from('deals')
      .update(payload)
      .eq('id', dealId);

    if (updateError) {
      console.error('[update-deal] DB error:', updateError.message);
      return json({ error: 'Database error' }, 500);
    }

    // ── 7. Fire automations (non-blocking) ───────────────────────────────────
    if (updates.stage && updates.stage !== deal.stage && organizationId) {
      const isWon = updates.stage === 'won';

      // Fire both triggers if won (deal_won gets its own rule set)
      triggerAutomations(
        isWon ? 'deal_won' : 'deal_stage_change',
        organizationId,
        {
          deal_id:    dealId,
          deal_title: deal.title,
          stage:      updates.stage,
          prev_stage: deal.stage,
          value:      Number(updates.value ?? deal.value ?? 0),
          user_id:    user.id,
        },
        authHeader,
      );

      // Also fire stage_change rules even on won (for any stage-specific rules)
      if (isWon) {
        triggerAutomations(
          'deal_stage_change',
          organizationId,
          {
            deal_id:    dealId,
            deal_title: deal.title,
            stage:      'won',
            prev_stage: deal.stage,
            value:      Number(updates.value ?? deal.value ?? 0),
            user_id:    user.id,
          },
          authHeader,
        );
      }
    }

    return json({
      success: true,
      dealId,
      message: updates.stage === 'won'
        ? '🎉 Deal won!'
        : updates.stage === 'lost'
          ? 'Deal marked as lost.'
          : 'Deal updated.',
    });

  } catch (err) {
    console.error('[update-deal] Unhandled error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});