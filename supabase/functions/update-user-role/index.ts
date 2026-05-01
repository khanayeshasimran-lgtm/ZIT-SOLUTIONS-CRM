/**
 * supabase/functions/update-user-role/index.ts
 *
 * DAY 2 — C5: Move role change from direct Supabase client write (Users.tsx)
 * to a backend Edge Function with server-side admin JWT validation.
 *
 * WHAT THE OLD CODE DID (WRONG):
 *   Users.tsx called supabase.from('profiles').update({ role: newRole }) directly.
 *   Any authenticated user who knew the API could call this endpoint and promote
 *   themselves to admin. The frontend role check (targetUser.id === user.id guard)
 *   is UI-only — it can be bypassed with a direct API call.
 *
 * WHAT THIS FUNCTION DOES (CORRECT):
 *   1. Extracts the caller's JWT — Supabase injects this automatically
 *   2. Reads the caller's role from the profiles table server-side
 *   3. Rejects the request with 403 if caller is not admin
 *   4. Rejects if the caller tries to change their own role (self-demotion/promotion risk)
 *   5. Validates the new role is one of the allowed values
 *   6. Writes the update — only if all checks pass
 *   7. Logs the action to audit_logs
 *
 * DEPLOY:
 *   supabase functions deploy update-user-role
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ROLES = ['user', 'admin', 'manager', 'investor', 'client'] as const;
type AppRole = typeof ALLOWED_ROLES[number];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── 1. Parse request body ────────────────────────────────────────────────
    const { targetUserId, newRole } = await req.json() as {
      targetUserId?: string;
      newRole?: string;
    };

    if (!targetUserId || !newRole) {
      return new Response(
        JSON.stringify({ success: false, error: 'targetUserId and newRole are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!ALLOWED_ROLES.includes(newRole as AppRole)) {
      return new Response(
        JSON.stringify({ success: false, error: `Invalid role. Must be one of: ${ALLOWED_ROLES.join(', ')}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── 2. Build authenticated client from caller's JWT ──────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl  = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey  = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // User client — to verify the caller's identity
    const userClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Service client — to perform the privileged write after validation
    const serviceClient = createClient(supabaseUrl, serviceKey);

    // ── 3. Identify the caller ───────────────────────────────────────────────
    const { data: { user: caller }, error: authError } = await userClient.auth.getUser();
    if (authError || !caller) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── 4. Self-change guard ─────────────────────────────────────────────────
    if (caller.id === targetUserId) {
      return new Response(
        JSON.stringify({ success: false, error: 'You cannot change your own role' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── 5. Verify caller is admin (server-side — cannot be spoofed) ──────────
    const { data: callerProfile, error: profileError } = await serviceClient
      .from('profiles')
      .select('role, organization_id')
      .eq('id', caller.id)
      .single();

    if (profileError || !callerProfile) {
      return new Response(
        JSON.stringify({ success: false, error: 'Could not verify caller permissions' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (callerProfile.role !== 'admin') {
      return new Response(
        JSON.stringify({ success: false, error: 'Only admins can change user roles' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── 6. Verify target user is in the same organization ───────────────────
    const { data: targetProfile, error: targetError } = await serviceClient
      .from('profiles')
      .select('role, organization_id, email')
      .eq('id', targetUserId)
      .single();

    if (targetError || !targetProfile) {
      return new Response(
        JSON.stringify({ success: false, error: 'Target user not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Cross-org role change attempt
    if (targetProfile.organization_id !== callerProfile.organization_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Cannot change role of a user in a different organization' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // No-op guard — role is already what was requested
    if (targetProfile.role === newRole) {
      return new Response(
        JSON.stringify({ success: true, message: 'Role unchanged — already set to ' + newRole }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── 7. Perform the update ────────────────────────────────────────────────
    const { error: updateError } = await serviceClient
      .from('profiles')
      .update({ role: newRole as AppRole })
      .eq('id', targetUserId);

    if (updateError) {
      return new Response(
        JSON.stringify({ success: false, error: updateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── 8. Audit log ─────────────────────────────────────────────────────────
    await serviceClient.from('audit_logs').insert({
      action:     'CHANGE_ROLE',
      entity:     'user_management',
      entity_id:  targetUserId,
      user_email: caller.email,
      // Include old → new role in a structured way for audit trail clarity
    }).catch(() => { /* audit failure must not block the response */ });

    return new Response(
      JSON.stringify({
        success: true,
        message: `Role updated to ${newRole}`,
        previousRole: targetProfile.role,
        newRole,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message ?? 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});