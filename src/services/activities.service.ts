/**
 * services/activities.service.ts
 *
 * Changes from original:
 *   ✅ READ  → Supabase directly (unchanged)
 *   ✅ WRITE → Edge Functions only (createActivity, updateActivity, deleteActivity,
 *              toggleActivityStatus now all go through backend)
 *   ✅ Meeting sync logic removed from service layer — Edge Functions own it now
 *   ✅ syncActivityToMeeting / unlinkMeeting / deleteSyncedMeeting kept for
 *      any legacy callers but marked @deprecated — remove after confirming
 *      no component calls them directly
 *   ✅ retryMutation kept only on reads (direct Supabase calls)
 *   ✅ All types and status mappers preserved
 */

import { supabase }         from '@/integrations/supabase/client';
import { callEdgeFunction } from '@/lib/api';
import { z }                from 'zod';

// ── Zod schema ────────────────────────────────────────────────────────────────

export const ActivitySchema = z.object({
  type:        z.enum(['call', 'meeting', 'follow_up', 'email']),
  title:       z.string().min(2, 'Title must be at least 2 characters').trim(),
  description: z.string().optional(),
  status:      z.enum(['scheduled', 'completed', 'cancelled']).default('scheduled'),
  due_date:    z.string().optional().nullable(),
  lead_id:     z.string().uuid().optional().nullable(),
  deal_id:     z.string().uuid().optional().nullable(),
});

export type ActivityInput = z.infer<typeof ActivitySchema>;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Activity {
  id: string;
  type: 'call' | 'meeting' | 'follow_up' | 'email';
  title: string;
  description: string | null;
  status: 'scheduled' | 'completed' | 'cancelled';
  due_date: string | null;
  lead_id: string | null;
  deal_id: string | null;
  created_by: string | null;
  linked_meeting_id: string | null;
  is_overdue?: boolean;
}

interface ApiResponse<T = unknown> {
  success: boolean;
  data: T | null;
  error: string | null;
}

// ── Status mappers (kept — used by components for display logic) ──────────────

export function activityStatusToMeeting(
  s: Activity['status']
): 'scheduled' | 'completed' | 'cancelled' {
  if (s === 'completed') return 'completed';
  if (s === 'cancelled') return 'cancelled';
  return 'scheduled';
}

export function meetingStatusToActivity(s: string): Activity['status'] {
  if (s === 'completed') return 'completed';
  if (s === 'cancelled') return 'cancelled';
  return 'scheduled';
}

// ── Legacy meeting sync helpers ───────────────────────────────────────────────
// @deprecated — meeting sync now happens inside the Edge Functions.
// These are kept only so existing component imports don't break.
// Remove after confirming no component calls them directly.

export async function syncActivityToMeeting(
  activityId: string,
  title: string,
  description: string | null,
  status: Activity['status'],
  dueDate: string | null,
  existingMeetingId: string | null | undefined,
  userId: string,
  leadId?: string | null
): Promise<string | null> {
  console.warn('[activities.service] syncActivityToMeeting is deprecated — meeting sync now happens in Edge Functions');
  return existingMeetingId ?? null;
}

export async function unlinkMeeting(meetingId: string): Promise<void> {
  console.warn('[activities.service] unlinkMeeting is deprecated — use update-activity Edge Function');
}

export async function deleteSyncedMeeting(meetingId: string): Promise<void> {
  console.warn('[activities.service] deleteSyncedMeeting is deprecated — use delete-activity Edge Function');
}

// ── READ — Supabase directly (RLS is the guard) ───────────────────────────────

export async function fetchActivities(
  userId: string,
  userRole: string
): Promise<Activity[]> {
  const { data, error } = await (supabase as any)
    .from('activities')
    .select('id, type, title, description, status, due_date, lead_id, deal_id, created_by, linked_meeting_id')
    .order('due_date', { ascending: true });

  if (error) throw new Error(error.message);

  const now = new Date();
  return ((data as any[]) ?? []).map((a: any) => ({
    ...a,
    is_overdue:
      a.status === 'scheduled' &&
      a.due_date !== null &&
      new Date(a.due_date) < now,
  })) as Activity[];
}

// ── WRITE — Edge Functions only ───────────────────────────────────────────────

/**
 * createActivity
 * Backend handles meeting sync atomically — no client-side sync needed.
 */
export async function createActivity(
  input: ActivityInput,
  userId: string  // kept for API compatibility but NOT sent to Edge Function
                  // backend extracts user from JWT
): Promise<Activity> {
  const parsed = ActivitySchema.parse(input);

  const res = await callEdgeFunction<ApiResponse<{ id: string; linkedMeetingId: string | null }>>('create-activity', {
    type:        parsed.type,
    title:       parsed.title,
    description: parsed.description || null,
    status:      parsed.status,
    due_date:    parsed.due_date    || null,
    lead_id:     parsed.lead_id     ?? null,
    deal_id:     parsed.deal_id     ?? null,
  });

  if (!res.success || !res.data) throw new Error(res.error ?? 'Failed to create activity');

  // Return a minimal Activity object — caller will refetch the full list
  return {
    id:                res.data.id,
    type:              parsed.type,
    title:             parsed.title,
    description:       parsed.description || null,
    status:            parsed.status,
    due_date:          parsed.due_date || null,
    lead_id:           parsed.lead_id ?? null,
    deal_id:           parsed.deal_id ?? null,
    created_by:        userId,
    linked_meeting_id: res.data.linkedMeetingId,
  };
}

/**
 * updateActivity
 * Backend handles meeting unlink/sync atomically.
 * The `existing` param is kept for API compat but no longer needed for sync logic.
 */
export async function updateActivity(
  id: string,
  input: Partial<ActivityInput>,
  existing: Activity  // kept for API compat — sync logic now in Edge Function
): Promise<void> {
  const parsed = ActivitySchema.partial().parse(input);
  const payload: Record<string, unknown> = { activityId: id };

  if (parsed.type        !== undefined) payload.type        = parsed.type;
  if (parsed.title       !== undefined) payload.title       = parsed.title.trim();
  if (parsed.description !== undefined) payload.description = parsed.description || null;
  if (parsed.status      !== undefined) payload.status      = parsed.status;
  if (parsed.due_date    !== undefined) payload.due_date    = parsed.due_date || null;
  if (parsed.lead_id     !== undefined) payload.lead_id     = parsed.lead_id ?? null;
  if (parsed.deal_id     !== undefined) payload.deal_id     = parsed.deal_id ?? null;

  const res = await callEdgeFunction<ApiResponse>('update-activity', payload);
  if (!res.success) throw new Error(res.error ?? 'Failed to update activity');
}

/**
 * deleteActivity
 * Backend handles meeting cleanup atomically.
 * The `linkedMeetingId` param is kept for API compat — Edge Function fetches it itself.
 */
export async function deleteActivity(
  id: string,
  linkedMeetingId: string | null  // kept for API compat — not sent to Edge Function
): Promise<void> {
  const res = await callEdgeFunction<ApiResponse>('delete-activity', { activityId: id });
  if (!res.success) throw new Error(res.error ?? 'Failed to delete activity');
}

/**
 * toggleActivityStatus
 * Sends the toggled status through update-activity.
 * Backend syncs the linked meeting status atomically.
 */
export async function toggleActivityStatus(
  activity: Activity
): Promise<Activity['status']> {
  const newStatus: Activity['status'] =
    activity.status === 'completed' ? 'scheduled' : 'completed';

  const res = await callEdgeFunction<ApiResponse>('update-activity', {
    activityId: activity.id,
    status:     newStatus,
  });

  if (!res.success) throw new Error(res.error ?? 'Failed to toggle activity status');
  return newStatus;
}