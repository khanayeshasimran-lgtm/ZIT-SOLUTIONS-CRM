/**
 * supabase/functions/create-organization/index.ts
 *
 * Creates a new organization and links the calling user to it.
 * Done server-side with the service role key because the organizations
 * table has RLS that blocks direct client INSERT (as it should — you don't
 * want any user to be able to create orgs directly).
 *
 * Called from: Onboarding.tsx (Create org tab, step 2)
 *
 * Request body:
 *   { companyName: string }
 *
 * Response:
 *   { success: true, orgId: string, slug: string }
 *   { success: false, error: string }
 *
 * DEPLOY:
 *   supabase functions deploy create-organization
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
    // ── 1. Parse ─────────────────────────────────────────────────────────────
    const { companyName } = await req.json() as { companyName?: string };

    if (!companyName || companyName.trim().length < 2) {
      return new Response(
        JSON.stringify({ success: false, error: 'Company name must be at least 2 characters' }),
        { status: 400, headers: corsHeaders },
      );
    }

    // ── 2. Auth ───────────────────────────────────────────────────────────────
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

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: corsHeaders },
      );
    }

    // ── 3. Check user doesn't already have an org ─────────────────────────────
    const { data: existingProfile } = await serviceClient
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (existingProfile?.organization_id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'You already belong to an organization. Sign out and use the invite code to join a different one.',
        }),
        { status: 409, headers: corsHeaders },
      );
    }

    // ── 4. Generate a unique slug ─────────────────────────────────────────────
    const baseSlug = companyName.trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 7)}`;

    // ── 5. Create org (service role bypasses RLS) ─────────────────────────────
    const { data: org, error: orgError } = await serviceClient
      .from('organizations')
      .insert({ name: companyName.trim(), slug, plan: 'starter' })
      .select('id')
      .single();

    if (orgError || !org) {
      return new Response(
        JSON.stringify({ success: false, error: orgError?.message ?? 'Failed to create organization' }),
        { status: 500, headers: corsHeaders },
      );
    }

    const orgId = (org as any).id as string;

    // ── 6. Link the user to the new org ──────────────────────────────────────
    const { error: profileError } = await serviceClient
      .from('profiles')
      .update({ organization_id: orgId })
      .eq('id', user.id);

    if (profileError) {
      // Rollback: delete the org we just created so we don't leave orphans
      await serviceClient.from('organizations').delete().eq('id', orgId);
      return new Response(
        JSON.stringify({ success: false, error: profileError.message }),
        { status: 500, headers: corsHeaders },
      );
    }

    return new Response(
      JSON.stringify({ success: true, orgId, slug }),
      { status: 200, headers: corsHeaders },
    );

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: corsHeaders },
    );
  }
});