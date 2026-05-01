import { supabase } from '@/integrations/supabase/client';
import { callEdgeFunction } from '@/lib/api';
import { z } from 'zod';

// ── Zod schema ────────────────────────────────────────────────────────────────

export const DealSchema = z.object({
  title:               z.string().min(2, 'Title must be at least 2 characters').trim(),
  value:               z.number().min(0, 'Value cannot be negative').default(0),
  stage:               z.enum(['new_lead','contacted','meeting_scheduled','proposal','negotiation','won','lost']),
  probability:         z.number().min(0).max(100).optional(),
  expected_close_date: z.string().optional(),
  lead_id:             z.string().uuid().optional().nullable(),
});

export type DealInput = z.infer<typeof DealSchema>;

export type DealStage =
  | 'new_lead' | 'contacted' | 'meeting_scheduled'
  | 'proposal' | 'negotiation' | 'won' | 'lost';

export interface Deal {
  id: string;
  title: string;
  stage: DealStage;
  value: number;
  probability: number;
  expected_close_date: string | null;
  created_at: string;
  created_by: string | null;
  lead_id: string | null;
  leads?: { name: string } | null;
}

// ── Standard API response shape ───────────────────────────────────────────────

interface ApiResponse<T = unknown> {
  success: boolean;
  data: T | null;
  error: string | null;
}

// ── Permission helper (UI ONLY — not a security boundary) ─────────────────────

export function canActOnDeal(
  deal: Pick<Deal, 'created_by'>,
  userId: string,
  userRole: string
): boolean {
  if (userRole === 'admin' || userRole === 'manager') return true;
  return deal.created_by === userId;
}

// ── Auto-probability map ──────────────────────────────────────────────────────

export const STAGE_PROBABILITY: Record<DealStage, number> = {
  new_lead:          10,
  contacted:         25,
  meeting_scheduled: 40,
  proposal:          60,
  negotiation:       80,
  won:               100,
  lost:              0,
};

export function getAutoProbability(stage: DealStage): number {
  return STAGE_PROBABILITY[stage];
}

// ── READ — full list for kanban board ────────────────────────────────────────
// Adds a 200-deal safety cap so the kanban never downloads thousands of rows.
// includeWonLost=true keeps Won/Lost columns visible on the board.

export async function fetchDealsForKanban(includeWonLost = true): Promise<Deal[]> {
  let query = (supabase as any)
    .from('deals')
    .select('id, title, stage, value, probability, expected_close_date, created_at, created_by, lead_id, leads(name)')
    .order('created_at', { ascending: false })
    .limit(200);

  if (!includeWonLost) {
    query = query.not('stage', 'in', '("won","lost")');
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as Deal[];
}

// ── READ — legacy full fetch (kept for export/analytics) ─────────────────────
export async function fetchDeals(): Promise<Deal[]> {
  const { data, error } = await (supabase as any)
    .from('deals')
    .select('id, title, stage, value, probability, expected_close_date, created_at, created_by, lead_id, leads(name)')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as Deal[];
}

// ── WRITE — Edge Functions only ───────────────────────────────────────────────

export async function createDeal(input: DealInput): Promise<Deal> {
  const parsed = DealSchema.parse(input);

  const res = await callEdgeFunction<ApiResponse<Deal>>('create-deal', {
    title:               parsed.title,
    value:               parsed.value,
    stage:               parsed.stage,
    probability:         parsed.probability ?? getAutoProbability(parsed.stage),
    expected_close_date: parsed.expected_close_date || null,
    lead_id:             parsed.lead_id ?? null,
  });

  if (!res.success || !res.data) throw new Error(res.error ?? 'Failed to create deal');
  return res.data;
}

export async function updateDeal(
  id: string,
  input: Partial<DealInput>
): Promise<void> {
  const payload: Record<string, unknown> = { dealId: id };

  if (input.title               !== undefined) payload.title               = input.title.trim();
  if (input.value               !== undefined) payload.value               = input.value;
  if (input.stage               !== undefined) {
    payload.stage       = input.stage;
    if (input.probability === undefined) {
      payload.probability = getAutoProbability(input.stage);
    }
  }
  if (input.probability         !== undefined) payload.probability         = input.probability;
  if (input.expected_close_date !== undefined) payload.expected_close_date = input.expected_close_date || null;

  const res = await callEdgeFunction<ApiResponse>('update-deal', payload);
  if (!res.success) throw new Error(res.error ?? 'Failed to update deal');
}

export async function updateDealStage(
  id: string,
  stage: DealStage
): Promise<{ message: string }> {
  const res = await callEdgeFunction<ApiResponse<{ message: string }>>('update-deal', {
    dealId:      id,
    stage,
    probability: getAutoProbability(stage),
  });

  if (!res.success) throw new Error(res.error ?? 'Failed to update deal stage');
  return res.data ?? { message: 'Stage updated.' };
}

export async function deleteDeal(id: string): Promise<void> {
  const res = await callEdgeFunction<ApiResponse>('delete-deal', { dealId: id });
  if (!res.success) throw new Error(res.error ?? 'Failed to delete deal');
}

// ── Analytics helpers — pure, no network ─────────────────────────────────────

export function getWeightedForecast(deals: Deal[]): number {
  return deals
    .filter(d => d.stage !== 'lost')
    .reduce((sum, d) => sum + (Number(d.value) * (d.probability ?? 0)) / 100, 0);
}

export function getDealsByStage(deals: Deal[]) {
  const stageOrder: DealStage[] = [
    'new_lead','contacted','meeting_scheduled','proposal','negotiation','won','lost'
  ];
  return stageOrder.map(stage => ({
    stage,
    deals: deals.filter(d => d.stage === stage),
    count: deals.filter(d => d.stage === stage).length,
    value: deals.filter(d => d.stage === stage).reduce((s, d) => s + Number(d.value), 0),
  }));
}