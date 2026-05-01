import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z }            from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const DeleteLeadSchema = z.object({
  leadId: z.string().uuid(),
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

    const parsed = DeleteLeadSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: 'Validation error', details: parsed.error.issues }, 400);
    }

    const { leadId } = parsed.data;

    const { data: lead, error: fetchError } = await adminClient
      .from('leads')
      .select('id, created_by, name')
      .eq('id', leadId)
      .single();

    if (fetchError || !lead) return json({ error: 'Lead not found' }, 404);

    const isOwner      = lead.created_by === user.id;
    const isPrivileged = userRole === 'admin' || userRole === 'manager';

    if (!isOwner && !isPrivileged) {
      return json({ error: 'Forbidden — you can only delete leads you created' }, 403);
    }

    const { error: deleteError } = await adminClient
      .from('leads')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', leadId);

    if (deleteError) {
      console.error('[delete-lead] DB error:', deleteError.message);
      return json({ error: 'Database error' }, 500);
    }

    return json({ success: true, leadId, leadName: lead.name });

  } catch (err) {
    console.error('[delete-lead] Unhandled error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});