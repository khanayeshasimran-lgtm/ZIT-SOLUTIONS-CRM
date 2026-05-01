import { supabase } from '@/integrations/supabase/client';
import { callEdgeFunction } from '@/lib/api';
import { z } from 'zod';

export const LeadSchema = z.object({
  name:   z.string().min(2, 'Name must be at least 2 characters').trim(),
  email:  z.string().email('Invalid email address').optional().or(z.literal('')),
  phone:  z.string().min(6, 'Phone too short').optional().or(z.literal('')),
  source: z.string().optional(),
  status: z.enum(['new', 'contacted', 'qualified', 'unqualified']).default('new'),
});

export type LeadInput = z.infer<typeof LeadSchema>;

export interface Lead {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  status: 'new' | 'contacted' | 'qualified' | 'unqualified';
  ai_score: number | null;
  created_at: string;
  created_by: string | null;
  last_contacted_at: string | null;
  is_important: boolean | null;
  deals?: { id: string }[];
  activities?: { type: string; created_at: string }[];
}

export interface LeadFilters {
  search?: string;
  status?: Lead['status'][];
  source?: string[];
  scoreTier?: 'hot' | 'warm' | 'cold';
  idleOnly?: boolean;
}

interface ApiResponse<T = unknown> {
  success: boolean;
  data: T | null;
  error: string | null;
  duplicate?: boolean;
  duplicates?: Pick<Lead, 'id' | 'name' | 'email' | 'phone'>[];
}

export type CreateLeadResult =
  | { type: 'created'; lead: Lead }
  | { type: 'duplicate'; duplicates: Pick<Lead, 'id' | 'name' | 'email' | 'phone'>[] };

export function canActOnLead(
  lead: Pick<Lead, 'created_by'>,
  userId: string,
  userRole: string
): boolean {
  if (userRole === 'admin' || userRole === 'manager') return true;
  return lead.created_by === userId;
}

export function computeLeadScore(params: {
  source: string | null;
  emailPresent: boolean;
  phonePresent: boolean;
  activityCount: number;
  daysOld: number;
  hasDeal: boolean;
}): number {
  let score = 0;
  const sourceScores: Record<string, number> = {
    referral: 30, linkedin: 20, website: 15, conference: 15, cold_call: 5,
  };
  score += sourceScores[params.source ?? ''] ?? 10;
  if (params.emailPresent) score += 15;
  if (params.phonePresent) score += 10;
  score += Math.min(params.activityCount * 5, 25);
  score -= Math.min(Math.floor(params.daysOld / 7) * 3, 30);
  if (params.hasDeal) score += 10;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function scoreTier(score: number | null): 'hot' | 'warm' | 'cold' {
  if (score === null) return 'cold';
  if (score >= 70) return 'hot';
  if (score >= 40) return 'warm';
  return 'cold';
}

export const SCORE_TIER_STYLES = {
  hot:  { label: 'Hot',  pill: 'bg-red-50 text-red-700 ring-1 ring-red-200' },
  warm: { label: 'Warm', pill: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' },
  cold: { label: 'Cold', pill: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200' },
} as const;

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

export async function findDuplicates(
  name: string,
  email: string,
  phone: string,
  excludeId?: string
): Promise<Pick<Lead, 'id' | 'name' | 'email' | 'phone'>[]> {
  const { data } = await supabase.from('leads').select('id, name, email, phone');
  if (!data) return [];
  const nameLower = name.toLowerCase().trim();
  return data.filter(lead => {
    if (excludeId && lead.id === excludeId) return false;
    if (email && lead.email && lead.email.toLowerCase() === email.toLowerCase()) return true;
    if (phone && lead.phone && lead.phone === phone) return true;
    return levenshtein(nameLower, (lead.name ?? '').toLowerCase().trim()) <= 2;
  });
}

// ── READ — full list (for export / import / AI scoring workflows) ─────────────
export async function fetchLeads(): Promise<Lead[]> {
  const { data, error } = await (supabase as any)
    .from('leads')
    .select('*, deals:deals!left(id), activities:activities!left(type, created_at)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((l: any) => ({
    ...l,
    activities: Array.isArray(l.activities) ? l.activities : [],
  })) as Lead[];
}

// ── READ — server-side paginated + filtered (used by Leads.tsx) ───────────────
export interface PagedResult<T> {
  data:       T[];
  count:      number;
  page:       number;
  pageSize:   number;
  totalPages: number;
  hasNext:    boolean;
  hasPrev:    boolean;
}

export async function fetchLeadsPaged(
  page: number,
  pageSize: number,
  filters: LeadFilters = {},
): Promise<PagedResult<Lead>> {
  const from = (page - 1) * pageSize;
  const to   = from + pageSize - 1;

  let query = (supabase as any)
    .from('leads')
    .select(
      '*, deals:deals!left(id), activities:activities!left(type, created_at)',
      { count: 'exact' },
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (filters.search) {
    const q = filters.search.trim();
    query = query.or(
      `name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%,source.ilike.%${q}%`,
    );
  }

  if (filters.status && filters.status.length > 0) {
    query = query.in('status', filters.status);
  }

  if (filters.source && filters.source.length > 0) {
    query = query.in('source', filters.source);
  }

  if (filters.scoreTier === 'hot') {
    query = query.gte('ai_score', 70);
  } else if (filters.scoreTier === 'warm') {
    query = query.gte('ai_score', 40).lt('ai_score', 70);
  } else if (filters.scoreTier === 'cold') {
    query = query.lt('ai_score', 40);
  }

  if (filters.idleOnly) {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - 3);
    query = query.or(
      `last_contacted_at.is.null,last_contacted_at.lt.${threshold.toISOString()}`,
    );
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  const total      = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const leads: Lead[] = ((data ?? []) as any[]).map((l: any) => ({
    ...l,
    activities: Array.isArray(l.activities) ? l.activities : [],
  }));

  return {
    data:       leads,
    count:      total,
    page,
    pageSize,
    totalPages,
    hasNext:    page < totalPages,
    hasPrev:    page > 1,
  };
}

// ── WRITE — Edge Functions ────────────────────────────────────────────────────

export async function createLead(
  input: LeadInput,
  force = false
): Promise<CreateLeadResult> {
  const parsed = LeadSchema.parse(input);
  const res = await callEdgeFunction<ApiResponse<Lead>>('create-lead', {
    name:   parsed.name,
    email:  parsed.email  || null,
    phone:  parsed.phone  || null,
    source: parsed.source || null,
    status: parsed.status,
    force,
  });

  if (res.duplicate === true) {
    return { type: 'duplicate', duplicates: res.duplicates ?? [] };
  }

  if (!res.success || !res.data) throw new Error(res.error ?? 'Failed to create lead');
  return { type: 'created', lead: res.data };
}

export async function updateLead(id: string, input: Partial<LeadInput>): Promise<void> {
  const payload: Record<string, unknown> = { leadId: id };
  if (input.name   !== undefined) payload.name   = input.name.trim();
  if (input.email  !== undefined) payload.email  = input.email  || null;
  if (input.phone  !== undefined) payload.phone  = input.phone  || null;
  if (input.source !== undefined) payload.source = input.source || null;
  if (input.status !== undefined) payload.status = input.status;
  const res = await callEdgeFunction<ApiResponse>('update-lead', payload);
  if (!res.success) throw new Error(res.error ?? 'Failed to update lead');
}

export async function deleteLead(id: string): Promise<void> {
  const res = await callEdgeFunction<ApiResponse>('delete-lead', { leadId: id });
  if (!res.success) throw new Error(res.error ?? 'Failed to delete lead');
}

export async function updateLeadImportant(id: string, isImportant: boolean): Promise<void> {
  const res = await callEdgeFunction<ApiResponse>('update-lead', {
    leadId: id, is_important: isImportant,
  });
  if (!res.success) throw new Error(res.error ?? 'Failed to update lead');
}

export async function updateLeadScore(id: string, score: number): Promise<void> {
  const res = await callEdgeFunction<ApiResponse>('update-lead', {
    leadId: id, ai_score: score,
  });
  if (!res.success) throw new Error(res.error ?? 'Failed to update score');
}

export async function updateLeadStatus(id: string, status: Lead['status']): Promise<void> {
  const res = await callEdgeFunction<ApiResponse>('update-lead', {
    leadId: id, status,
  });
  if (!res.success) throw new Error(res.error ?? 'Failed to update status');
}

// ── Filters (kept for export page usage) ─────────────────────────────────────
export function applyLeadFilters(leads: Lead[], filters: LeadFilters): Lead[] {
  return leads.filter(lead => {
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const matches =
        lead.name.toLowerCase().includes(q) ||
        (lead.email ?? '').toLowerCase().includes(q) ||
        (lead.phone ?? '').includes(q) ||
        (lead.source ?? '').toLowerCase().includes(q);
      if (!matches) return false;
    }
    if (filters.status?.length) {
      if (!filters.status.includes(lead.status)) return false;
    }
    if (filters.source?.length) {
      if (!filters.source.includes(lead.source ?? '')) return false;
    }
    if (filters.scoreTier) {
      if (scoreTier(lead.ai_score ?? null) !== filters.scoreTier) return false;
    }
    if (filters.idleOnly) {
      if (lead.last_contacted_at) {
        const threshold = new Date();
        threshold.setDate(threshold.getDate() - 3);
        if (new Date(lead.last_contacted_at) >= threshold) return false;
      }
    }
    return true;
  });
}