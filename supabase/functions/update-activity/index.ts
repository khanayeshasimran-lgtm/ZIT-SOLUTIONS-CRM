/**
 * supabase/functions/update-activity/index.ts
 *
 * Changes from original:
 *   ✅ CORS header now includes x-client-info, apikey
 *   ✅ Response shape now returns { success: true, activityId } consistently
 *   ✅ All original logic preserved
 *
 * Deploy: supabase functions deploy update-activity
 */

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z }            from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const UpdateActivitySchema = z.object({
  activityId:  z.string().uuid(),
  type:        z.enum(['call', 'meeting', 'follow_up', 'email']).optional(),
  title:       z.string().min(2).max(200).trim().optional(),
  description: z.string().max(2000).optional().nullable(),
  status:      z.enum(['scheduled', 'completed', 'cancelled']).optional(),
  due_date:    z.string().optional().nullable(),
  lead_id:     z.string().uuid().optional().nullable(),
  deal_id:     z.string().uuid().optional().nullable(),
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

function activityStatusToMeeting(s: string): string {
  if (s === 'completed') return 'completed';
  if (s === 'cancelled') return 'cancelled';
  return 'scheduled';
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

    const parsed = UpdateActivitySchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: 'Validation error', details: parsed.error.issues }, 400);
    }

    const { activityId, ...updates } = parsed.data;

    const { data: existing, error: fetchError } = await adminClient
      .from('activities')
      .select('id, created_by, type, status, linked_meeting_id')
      .eq('id', activityId)
      .single();

    if (fetchError || !existing) return json({ error: 'Activity not found' }, 404);

    const isOwner      = existing.created_by === user.id;
    const isPrivileged = userRole === 'admin' || userRole === 'manager';

    if (!isOwner && !isPrivileged) {
      return json({ error: 'Forbidden — you can only edit activities you created' }, 403);
    }

    const payload: Record<string, unknown> = {};

    if (updates.title       !== undefined) payload.title       = updates.title.trim();
    if (updates.description !== undefined) payload.description = updates.description || null;
    if (updates.status      !== undefined) payload.status      = updates.status;
    if (updates.due_date    !== undefined) payload.due_date    = updates.due_date || null;
    if (updates.lead_id     !== undefined) payload.lead_id     = updates.lead_id;
    if (updates.deal_id     !== undefined) payload.deal_id     = updates.deal_id;

    const typeBecameNonMeeting =
      existing.type === 'meeting' &&
      updates.type !== undefined &&
      updates.type !== 'meeting';

    if (typeBecameNonMeeting && existing.linked_meeting_id) {
      await adminClient
        .from('meetings')
        .update({ linked_activity_id: null })
        .eq('id', existing.linked_meeting_id);
      payload.linked_meeting_id = null;
    }

    if (updates.type !== undefined) payload.type = updates.type;

    if (Object.keys(payload).length === 0) {
      return json({ error: 'No fields to update' }, 400);
    }

    const { error: updateError } = await adminClient
      .from('activities')
      .update(payload)
      .eq('id', activityId);

    if (updateError) {
      console.error('[update-activity] DB error:', updateError.message);
      return json({ error: 'Database error' }, 500);
    }

    const linkedMeetingId = existing.linked_meeting_id;
    if (updates.status && linkedMeetingId && !typeBecameNonMeeting) {
      await adminClient
        .from('meetings')
        .update({ status: activityStatusToMeeting(updates.status) })
        .eq('id', linkedMeetingId);
    }

    return json({ success: true, activityId });

  } catch (err) {
    console.error('[update-activity] Unhandled error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});