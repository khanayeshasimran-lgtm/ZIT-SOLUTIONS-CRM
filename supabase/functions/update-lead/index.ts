import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z }            from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const UpdateLeadSchema = z.object({
  leadId:       z.string().uuid(),
  name:         z.string().min(2).max(200).trim().optional(),
  email:        z.string().email().or(z.literal('')).optional(),
  phone:        z.string().min(6).max(30).or(z.literal('')).optional(),
  source:       z.string().max(100).optional(),
  status:       z.enum(['new', 'contacted', 'qualified', 'unqualified']).optional(),
  is_important: z.boolean().optional(),
  ai_score:     z.number().min(0).max(100).optional(),
});

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

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
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

    const { data: profile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const userRole: string = profile?.role ?? 'user';

    let body: unknown;
    try { body = await req.json(); }
    catch { return json({ error: 'Invalid JSON body' }, 400); }

    const parsed = UpdateLeadSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: 'Validation error', details: parsed.error.issues }, 400);
    }

    const { leadId, ...updates } = parsed.data;

    const { data: lead, error: fetchError } = await adminClient
      .from('leads')
      .select('id, created_by')
      .eq('id', leadId)
      .single();

    if (fetchError || !lead) return json({ error: 'Lead not found' }, 404);

    const isOwner      = lead.created_by === user.id;
    const isPrivileged = userRole === 'admin' || userRole === 'manager';

    if (!isOwner && !isPrivileged) {
      return json({ error: 'Forbidden — you can only edit leads you created' }, 403);
    }

    const payload: Record<string, unknown> = {};
    if (updates.name         !== undefined) payload.name         = updates.name.trim();
    if (updates.email        !== undefined) payload.email        = updates.email || null;
    if (updates.phone        !== undefined) payload.phone        = updates.phone || null;
    if (updates.source       !== undefined) payload.source       = updates.source || null;
    if (updates.status       !== undefined) payload.status       = updates.status;
    if (updates.is_important !== undefined) payload.is_important = updates.is_important;
    if (updates.ai_score     !== undefined) payload.ai_score     = updates.ai_score;

    if (updates.status === 'contacted') {
      payload.last_contacted_at = new Date().toISOString();
    }

    if (Object.keys(payload).length === 0) {
      return json({ error: 'No fields to update' }, 400);
    }

    const { error: updateError } = await adminClient
      .from('leads')
      .update(payload)
      .eq('id', leadId);

    if (updateError) {
      console.error('[update-lead] DB error:', updateError.message);
      return json({ error: 'Database error' }, 500);
    }

    return json({ success: true, leadId });

  } catch (err) {
    console.error('[update-lead] Unhandled error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});