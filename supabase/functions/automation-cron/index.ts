/**
 * supabase/functions/automation-cron/index.ts
 *
 * Runs on a schedule to detect:
 *   - Idle leads (not contacted in N days)
 *   - Stalled deals (stuck in same stage for N days)
 *
 * Set up as a Supabase cron job:
 *   Go to Supabase Dashboard → Database → Cron Jobs → Create new
 *   Schedule: 0 * * * *   (every hour)
 *   Command:  SELECT net.http_post(
 *               url := 'https://<your-project>.supabase.co/functions/v1/automation-cron',
 *               headers := '{"Authorization": "Bearer <SERVICE_ROLE_KEY>", "Content-Type": "application/json"}',
 *               body := '{}'
 *             );
 *
 * Deploy: supabase functions deploy automation-cron
 */

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

async function callRunAutomations(
  trigger_type: string,
  organization_id: string,
  context: Record<string, unknown>,
  serviceRoleKey: string,
  supabaseUrl: string,
): Promise<void> {
  try {
    await fetch(`${supabaseUrl}/functions/v1/run-automations`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ trigger_type, organization_id, context }),
    });
  } catch (err) {
    console.warn('[automation-cron] run-automations call failed:', err);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  // Only service role can call this
  const authHeader = req.headers.get('Authorization') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

  const adminClient = createClient(supabaseUrl, serviceKey);

  let idleLeadCount   = 0;
  let stalledDealCount = 0;

  try {
    // ── 1. Get all active idle_lead rules to know the thresholds ─────────────
    const { data: idleRules } = await adminClient
      .from('automation_rules')
      .select('organization_id, trigger_config')
      .eq('trigger_type', 'idle_lead')
      .eq('is_active', true);

    const { data: stalledRules } = await adminClient
      .from('automation_rules')
      .select('organization_id, trigger_config')
      .eq('trigger_type', 'stalled_deal')
      .eq('is_active', true);

    // ── 2. Check idle leads ───────────────────────────────────────────────────
    // Get the minimum idle_days threshold across all rules (or default 5)
    const minIdleDays = Math.min(
      ...(idleRules ?? []).map((r: any) => Number(r.trigger_config?.idle_days ?? 5)),
      5
    );

    const idleThreshold = new Date();
    idleThreshold.setDate(idleThreshold.getDate() - minIdleDays);

    const { data: idleLeads } = await adminClient
      .from('leads')
      .select('id, name, organization_id, last_contacted_at, created_at')
      .is('deleted_at', null)
      .not('status', 'eq', 'unqualified')
      .or(`last_contacted_at.lte.${idleThreshold.toISOString()},last_contacted_at.is.null`);

    for (const lead of idleLeads ?? []) {
      if (!lead.organization_id) continue;

      const lastContact = lead.last_contacted_at ?? lead.created_at;
      const idleDays = Math.floor(
        (Date.now() - new Date(lastContact).getTime()) / 86_400_000
      );

      await callRunAutomations(
        'idle_lead',
        lead.organization_id,
        {
          lead_id:   lead.id,
          lead_name: lead.name,
          idle_days: idleDays,
        },
        serviceKey,
        supabaseUrl,
      );

      idleLeadCount++;
    }

    // ── 3. Check stalled deals ────────────────────────────────────────────────
    const minStalledDays = Math.min(
      ...(stalledRules ?? []).map((r: any) => Number(r.trigger_config?.stalled_days ?? 7)),
      7
    );

    const stalledThreshold = new Date();
    stalledThreshold.setDate(stalledThreshold.getDate() - minStalledDays);

    const { data: stalledDeals } = await adminClient
      .from('deals')
      .select('id, title, stage, organization_id, updated_at')
      .not('stage', 'in', '("won","lost")')
      .lte('updated_at', stalledThreshold.toISOString());

    for (const deal of stalledDeals ?? []) {
      if (!deal.organization_id) continue;

      const stalledDays = Math.floor(
        (Date.now() - new Date(deal.updated_at).getTime()) / 86_400_000
      );

      await callRunAutomations(
        'stalled_deal',
        deal.organization_id,
        {
          deal_id:     deal.id,
          deal_title:  deal.title,
          stage:       deal.stage,
          idle_days:   stalledDays,
        },
        serviceKey,
        supabaseUrl,
      );

      stalledDealCount++;
    }

    console.log(`[automation-cron] Done. idle_leads=${idleLeadCount} stalled_deals=${stalledDealCount}`);

    return json({
      success:      true,
      idle_leads:   idleLeadCount,
      stalled_deals: stalledDealCount,
      ran_at:       new Date().toISOString(),
    });

  } catch (err) {
    console.error('[automation-cron] Unhandled error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});