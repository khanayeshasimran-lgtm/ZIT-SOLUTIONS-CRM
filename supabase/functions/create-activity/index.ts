/**
 * supabase/functions/create-activity/index.ts
 *
 * Changes from original:
 *   ✅ CORS header now includes x-client-info, apikey (fixes client CORS errors)
 *   ✅ All original logic preserved (JWT, meeting sync, back-link)
 *
 * Deploy: supabase functions deploy create-activity
 */

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z }            from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const CreateActivitySchema = z.object({
  type:        z.enum(['call', 'meeting', 'follow_up', 'email']),
  title:       z.string().min(2, 'Title too short').max(200).trim(),
  description: z.string().max(2000).optional().nullable(),
  status:      z.enum(['scheduled', 'completed', 'cancelled']).default('scheduled'),
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

    let body: unknown;
    try { body = await req.json(); }
    catch { return json({ error: 'Invalid JSON body' }, 400); }

    const parsed = CreateActivitySchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: 'Validation error', details: parsed.error.issues }, 400);
    }

    const input = parsed.data;

    const { data: activity, error: insertError } = await adminClient
      .from('activities')
      .insert([{
        type:        input.type,
        title:       input.title,
        description: input.description || null,
        status:      input.status,
        due_date:    input.due_date    || null,
        lead_id:     input.lead_id     ?? null,
        deal_id:     input.deal_id     ?? null,
        created_by:  user.id,
      }])
      .select('id')
      .single();

    if (insertError) {
      console.error('[create-activity] Insert error:', insertError.message);
      return json({ error: 'Database error' }, 500);
    }

    const activityId: string = activity.id;
    let linkedMeetingId: string | null = null;

    if (input.type === 'meeting') {
      const { data: meeting, error: meetingError } = await adminClient
        .from('meetings')
        .insert([{
          title:              input.title,
          description:        input.description || null,
          meeting_type:       'other',
          status:             activityStatusToMeeting(input.status),
          mode:               'virtual',
          start_time:         input.due_date || null,
          linked_activity_id: activityId,
          created_by:         user.id,
        }])
        .select('id')
        .single();

      if (meetingError) {
        console.error('[create-activity] Failed to create linked meeting:', meetingError.message);
      } else {
        linkedMeetingId = meeting?.id ?? null;
        if (linkedMeetingId) {
          await adminClient
            .from('activities')
            .update({ linked_meeting_id: linkedMeetingId })
            .eq('id', activityId);
        }
      }
    }

    return json({ success: true, data: { id: activityId, linkedMeetingId } });

  } catch (err) {
    console.error('[create-activity] Unhandled error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});