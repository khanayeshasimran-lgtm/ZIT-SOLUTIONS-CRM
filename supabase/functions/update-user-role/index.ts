// supabase/functions/update-user-role/index.ts
// Accepts companyId + organizationId for client assignments and writes
// both fields server-side (service role key bypasses RLS).
// Deploy: supabase functions deploy update-user-role

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ROLES = ['user', 'admin', 'manager', 'investor', 'client'] as const;
type AppRole = typeof ALLOWED_ROLES[number];

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type':                 'application/json',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json() as {
      targetUserId?:   string;
      newRole?:        string;
      companyId?:      string | null;      // ← NEW: written to profiles.company_id
      organizationId?: string | null;      // ← written to profiles.organization_id
    };

    const { targetUserId, newRole, companyId, organizationId } = body;

    if (!targetUserId || !newRole) {
      return new Response(
        JSON.stringify({ success: false, error: 'targetUserId and newRole are required' }),
        { status: 400, headers: corsHeaders },
      );
    }

    if (!ALLOWED_ROLES.includes(newRole as AppRole)) {
      return new Response(
        JSON.stringify({ success: false, error: `Invalid role. Must be one of: ${ALLOWED_ROLES.join(', ')}` }),
        { status: 400, headers: corsHeaders },
      );
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing authorization header' }),
        { status: 401, headers: corsHeaders },
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient    = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const serviceClient = createClient(supabaseUrl, serviceKey);

    // Identify caller
    const { data: { user: caller }, error: authError } = await userClient.auth.getUser();
    if (authError || !caller) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: corsHeaders },
      );
    }

    if (caller.id === targetUserId) {
      return new Response(
        JSON.stringify({ success: false, error: 'You cannot change your own role' }),
        { status: 403, headers: corsHeaders },
      );
    }

    // Verify caller is admin
    const { data: callerProfile } = await serviceClient
      .from('profiles')
      .select('role, organization_id')
      .eq('id', caller.id)
      .single();

    if (!callerProfile || callerProfile.role !== 'admin') {
      return new Response(
        JSON.stringify({ success: false, error: 'Only admins can change user roles' }),
        { status: 403, headers: corsHeaders },
      );
    }

    // Fetch target profile
    const { data: targetProfile } = await serviceClient
      .from('profiles')
      .select('role, organization_id')
      .eq('id', targetUserId)
      .single();

    if (!targetProfile) {
      return new Response(
        JSON.stringify({ success: false, error: 'Target user not found' }),
        { status: 404, headers: corsHeaders },
      );
    }

    // Cross-org guard — exempt client assignments (clients are always external)
    const isClientAssignment = newRole === 'client';
    const targetHasNoOrg     = targetProfile.organization_id === null;
    const targetInSameOrg    = targetProfile.organization_id === callerProfile.organization_id;

    if (!isClientAssignment && !targetHasNoOrg && !targetInSameOrg) {
      return new Response(
        JSON.stringify({ success: false, error: 'Cannot change role of a user in a different organization' }),
        { status: 403, headers: corsHeaders },
      );
    }

    // Build update payload
    // For client role: write role + company_id + organization_id all at once,
    // server-side, bypassing RLS. This is the only place these get written.
    const updatePayload: Record<string, unknown> = { role: newRole };

    if (isClientAssignment) {
      updatePayload.company_id      = companyId      ?? null;
      updatePayload.organization_id = organizationId ?? null;
    }

    const { error: updateError } = await serviceClient
      .from('profiles')
      .update(updatePayload)
      .eq('id', targetUserId);

    if (updateError) {
      return new Response(
        JSON.stringify({ success: false, error: updateError.message }),
        { status: 500, headers: corsHeaders },
      );
    }

    // Audit log
    try {
      await serviceClient.from('audit_logs').insert({
        action:     'CHANGE_ROLE',
        entity:     'user_management',
        entity_id:  targetUserId,
        user_email: caller.email,
        details:    JSON.stringify({ previousRole: targetProfile.role, newRole, companyId }),
      });
    } catch (_) { /* audit failure must never block the response */ }

    return new Response(
      JSON.stringify({ success: true, message: `Role updated to ${newRole}`, previousRole: targetProfile.role, newRole }),
      { status: 200, headers: corsHeaders },
    );

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return new Response(JSON.stringify({ success: false, error: message }), { status: 500, headers: corsHeaders });
  }
});