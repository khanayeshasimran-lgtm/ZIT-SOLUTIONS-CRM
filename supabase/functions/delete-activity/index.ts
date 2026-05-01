/**
 * supabase/functions/delete-activity/index.ts
 *
 * Authoritative backend handler for activity deletion.
 * Deletes the linked meeting record too (previously done in React component).
 *
 * Deploy: supabase functions deploy delete-activity
 */

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z }            from 'https://deno.land/x/zod@v3.22.4/mod.ts';

// ── Schema ─────────────────────────────────────────────────────────────────────

const DeleteActivitySchema = z.object({
  activityId: z.string().uuid(),
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

    // ── 2. Load role from DB ─────────────────────────────────────────────────
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

    // ── 3. Validate input ────────────────────────────────────────────────────
    let body: unknown;
    try { body = await req.json(); }
    catch { return json({ error: 'Invalid JSON body' }, 400); }

    const parsed = DeleteActivitySchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: 'Validation error', details: parsed.error.issues }, 400);
    }

    const { activityId } = parsed.data;

    // ── 4. Load activity + check ownership ──────────────────────────────────
    const { data: activity, error: fetchError } = await adminClient
      .from('activities')
      .select('id, created_by, linked_meeting_id')
      .eq('id', activityId)
      .single();

    if (fetchError || !activity) return json({ error: 'Activity not found' }, 404);

    const isOwner      = activity.created_by === user.id;
    const isPrivileged = userRole === 'admin' || userRole === 'manager';

    if (!isOwner && !isPrivileged) {
      return json({ error: 'Forbidden — you can only delete activities you created' }, 403);
    }

    // ── 5. Delete linked meeting first (if exists) ───────────────────────────
    if (activity.linked_meeting_id) {
      const { error: meetingDeleteError } = await adminClient
        .from('meetings')
        .delete()
        .eq('id', activity.linked_meeting_id);

      if (meetingDeleteError) {
        console.error('[delete-activity] Failed to delete linked meeting:', meetingDeleteError.message);
        // Non-fatal — proceed with activity deletion
      }
    }

    // ── 6. Delete activity ───────────────────────────────────────────────────
    const { error: deleteError } = await adminClient
      .from('activities')
      .delete()
      .eq('id', activityId);

    if (deleteError) {
      console.error('[delete-activity] DB error:', deleteError.message);
      return json({ error: 'Database error' }, 500);
    }

    return json({
      success: true,
      activityId,
      linkedMeetingDeleted: !!activity.linked_meeting_id,
    });

  } catch (err) {
    console.error('[delete-activity] Unhandled error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});