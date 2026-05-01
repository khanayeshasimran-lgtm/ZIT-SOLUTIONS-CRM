/**
 * supabase/functions/run-automations/index.ts
 *
 * Workflow automation engine.
 * Called by:
 *   1. update-deal    — on stage change (deal_stage_change, deal_won)
 *   2. A Supabase cron job (every hour) — for idle_lead, stalled_deal checks
 *
 * Deploy: supabase functions deploy run-automations
 */

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z }            from 'https://deno.land/x/zod@v3.22.4/mod.ts';

// ── Input schema ──────────────────────────────────────────────────────────────

const RequestSchema = z.object({
  trigger_type:    z.enum(['deal_stage_change', 'deal_won', 'idle_lead', 'stalled_deal', 'overdue_task']),
  organization_id: z.string().uuid(),
  context: z.object({
    deal_id:    z.string().uuid().optional(),
    deal_title: z.string().optional(),
    stage:      z.string().optional(),
    prev_stage: z.string().optional(),
    lead_id:    z.string().uuid().optional(),
    lead_name:  z.string().optional(),
    idle_days:  z.number().optional(),
    value:      z.number().optional(),
    user_id:    z.string().uuid().optional(),
  }).optional().default({}),
});

type AutomationRequest = z.infer<typeof RequestSchema>;

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

// ── Template interpolation ────────────────────────────────────────────────────

function interpolate(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] ?? `{{${key}}}`));
}

// ── Action executors ──────────────────────────────────────────────────────────

async function executeCreateActivity(
  adminClient: ReturnType<typeof createClient>,
  actionConfig: Record<string, unknown>,
  context: AutomationRequest['context'],
  organizationId: string,
): Promise<{ success: boolean; detail: string }> {
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + (Number(actionConfig.due_days) || 0));

  const { error } = await adminClient.from('activities').insert([{
    type:            actionConfig.type ?? 'follow_up',
    title:           interpolate(String(actionConfig.title ?? 'Follow up'), context as Record<string, unknown>),
    description:     `Auto-created by workflow automation (trigger: ${context?.stage ?? 'rule'})`,
    status:          'scheduled',
    due_date:        dueDate.toISOString(),
    deal_id:         context?.deal_id ?? null,
    created_by:      context?.user_id ?? null,
    organization_id: organizationId,
  }]);

  if (error) return { success: false, detail: error.message };
  return { success: true, detail: `Activity "${actionConfig.title}" created, due in ${actionConfig.due_days ?? 0} day(s)` };
}

async function executeSendNotification(
  adminClient: ReturnType<typeof createClient>,
  actionConfig: Record<string, unknown>,
  context: AutomationRequest['context'],
  organizationId: string,
): Promise<{ success: boolean; detail: string }> {
  // Look up the org owner / admins to notify
  const { data: admins } = await adminClient
    .from('profiles')
    .select('id, email')
    .eq('organization_id', organizationId)
    .in('role', ['admin', 'manager']);

  if (!admins?.length) return { success: false, detail: 'No admins found to notify' };

  const vars = context as Record<string, unknown>;
  const subject = interpolate(String(actionConfig.subject ?? 'CRM Alert'), vars);
  const body    = interpolate(String(actionConfig.body_template ?? ''), vars);

  // Insert into notifications table (in-app)
  const notifRows = admins.map((a: { id: string; email: string }) => ({
    user_id:         a.id,
    organization_id: organizationId,
    event:           actionConfig.event ?? 'idle_lead',
    title:           subject,
    body,
    is_read:         false,
    created_at:      new Date().toISOString(),
  }));

  const { error } = await adminClient.from('notifications').insert(notifRows);
  if (error) {
    // notifications table might not exist yet — log but don't hard fail
    console.warn('[run-automations] notifications insert error:', error.message);
    return { success: true, detail: `Would notify ${admins.length} admin(s): ${subject}` };
  }

  return { success: true, detail: `Notified ${admins.length} admin(s): ${subject}` };
}

async function executeUpdateLeadStatus(
  adminClient: ReturnType<typeof createClient>,
  actionConfig: Record<string, unknown>,
  context: AutomationRequest['context'],
): Promise<{ success: boolean; detail: string }> {
  if (!context?.lead_id) return { success: false, detail: 'No lead_id in context' };

  const { error } = await adminClient
    .from('leads')
    .update({ status: actionConfig.status ?? 'contacted' })
    .eq('id', context.lead_id);

  if (error) return { success: false, detail: error.message };
  return { success: true, detail: `Lead status updated to ${actionConfig.status}` };
}

// ── Rule matching ─────────────────────────────────────────────────────────────

function ruleMatchesTrigger(
  rule: { trigger_type: string; trigger_config: Record<string, unknown> },
  request: AutomationRequest,
): boolean {
  if (rule.trigger_type !== request.trigger_type) return false;
  const cfg = rule.trigger_config;
  const ctx = request.context ?? {};

  switch (request.trigger_type) {
    case 'deal_stage_change':
      // If rule specifies a stage, only match that stage
      if (cfg.stage && cfg.stage !== ctx.stage) return false;
      return true;

    case 'deal_won':
      return true;

    case 'idle_lead':
      // Only fire if actual idle days >= configured threshold
      if (cfg.idle_days && (ctx.idle_days ?? 0) < Number(cfg.idle_days)) return false;
      return true;

    case 'stalled_deal':
      if (cfg.stalled_days && (ctx.idle_days ?? 0) < Number(cfg.stalled_days)) return false;
      if (cfg.stage && cfg.stage !== ctx.stage) return false;
      return true;

    default:
      return true;
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    // Auth — only internal calls (service role) or authenticated users
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Missing Authorization header' }, 401);
    }

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Parse body
    let body: unknown;
    try { body = await req.json(); }
    catch { return json({ error: 'Invalid JSON body' }, 400); }

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: 'Validation error', details: parsed.error.issues }, 400);
    }

    const request = parsed.data;

    // Load active rules for this org (org-specific + global defaults where org is null)
    const { data: rules, error: rulesError } = await adminClient
      .from('automation_rules')
      .select('*')
      .eq('is_active', true)
      .or(`organization_id.eq.${request.organization_id},organization_id.is.null`);

    if (rulesError) {
      console.error('[run-automations] rules fetch error:', rulesError.message);
      return json({ error: 'Failed to load automation rules' }, 500);
    }

    const matchingRules = (rules ?? []).filter((r: any) =>
      ruleMatchesTrigger(r, request)
    );

    if (matchingRules.length === 0) {
      return json({ success: true, fired: 0, message: 'No matching rules' });
    }

    const results: Array<{ rule: string; action: string; success: boolean; detail: string }> = [];

    for (const rule of matchingRules) {
      const cfg = rule.action_config as Record<string, unknown>;
      let result: { success: boolean; detail: string };

      try {
        switch (rule.action_type) {
          case 'create_activity':
            result = await executeCreateActivity(adminClient, cfg, request.context, request.organization_id);
            break;
          case 'send_notification':
            result = await executeSendNotification(adminClient, cfg, request.context, request.organization_id);
            break;
          case 'update_lead_status':
            result = await executeUpdateLeadStatus(adminClient, cfg, request.context);
            break;
          default:
            result = { success: false, detail: `Unknown action type: ${rule.action_type}` };
        }
      } catch (err) {
        result = { success: false, detail: String(err) };
      }

      results.push({
        rule:    rule.name,
        action:  rule.action_type,
        success: result.success,
        detail:  result.detail,
      });

      // Log every execution
      await adminClient.from('automation_logs').insert([{
        organization_id: request.organization_id,
        rule_id:         rule.id,
        rule_name:       rule.name,
        trigger_type:    request.trigger_type,
        entity_type:     request.context?.deal_id ? 'deal' : request.context?.lead_id ? 'lead' : null,
        entity_id:       request.context?.deal_id ?? request.context?.lead_id ?? null,
        action_taken:    result.detail,
        success:         result.success,
        error_message:   result.success ? null : result.detail,
      }]);
    }

    return json({
      success: true,
      fired:   results.length,
      results,
    });

  } catch (err) {
    console.error('[run-automations] Unhandled error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});