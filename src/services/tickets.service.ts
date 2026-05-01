import { supabase } from '@/integrations/supabase/client';
import { callEdgeFunction } from '@/lib/api';
import { z } from 'zod';

// ── Zod schema ────────────────────────────────────────────────────────────────

export const TicketSchema = z.object({
  title:             z.string().min(3, 'Title must be at least 3 characters').max(150).trim(),
  description:       z.string().max(2000).optional().or(z.literal('')),
  notes:             z.string().max(2000).optional().or(z.literal('')),
  priority:          z.enum(['low', 'medium', 'high', 'urgent']),
  status:            z.enum(['open', 'in_progress', 'resolved', 'closed']),
  category:          z.string().optional().nullable(),
  assigned_to_email: z.string().email().or(z.literal('')).optional(),
  github_issue_url:  z.string().url().or(z.literal('')).optional(),
  lead_id:           z.string().uuid().optional().nullable(),
  contact_id:        z.string().uuid().optional().nullable(),
  company_id:        z.string().uuid().optional().nullable(),
});

export type TicketInput = z.infer<typeof TicketSchema>;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Ticket {
  id: string;
  title: string;
  description: string | null;
  notes: string | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  category: string | null;
  assigned_to_email: string | null;
  github_issue_url: string | null;
  created_at: string;
  created_by: string | null;
  lead_id: string | null;
  contact_id: string | null;
  company_id: string | null;
}

// ── Standard API response shape ───────────────────────────────────────────────

interface ApiResponse<T = unknown> {
  success: boolean;
  data: T | null;
  error: string | null;
}

// ── Permission helper (UI ONLY — not a security boundary) ─────────────────────

export function canActOnTicket(
  ticket: Pick<Ticket, 'created_by'>,
  userId: string,
  userRole: string
): boolean {
  if (userRole === 'admin' || userRole === 'manager') return true;
  return ticket.created_by === userId;
}

// ── READ — full list (for export) ─────────────────────────────────────────────
export async function fetchTickets(): Promise<Ticket[]> {
  const { data, error } = await (supabase as any)
    .from('tickets')
    .select('id, title, description, notes, priority, status, category, assigned_to_email, github_issue_url, created_at, lead_id, contact_id, company_id, created_by')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as Ticket[];
}

// ── READ — server-side paginated + filtered (used by Tickets.tsx) ─────────────

export interface TicketFilters {
  search?:   string;
  status?:   Ticket['status'][];
  priority?: Ticket['priority'][];
}

export interface PagedTicket extends Ticket {
  lead_name?:    string | null;
  contact_name?: string | null;
  company_name?: string | null;
}

export interface PagedResult<T> {
  data:       T[];
  count:      number;
  page:       number;
  pageSize:   number;
  totalPages: number;
  hasNext:    boolean;
  hasPrev:    boolean;
}

export async function fetchTicketsPaged(
  page: number,
  pageSize: number,
  filters: TicketFilters = {},
): Promise<PagedResult<PagedTicket>> {
  const from = (page - 1) * pageSize;
  const to   = from + pageSize - 1;

  let query = (supabase as any)
    .from('tickets')
    .select(
      `id, title, description, notes, priority, status, category,
       assigned_to_email, github_issue_url, created_at, lead_id,
       contact_id, company_id, created_by,
       leads!left(name),
       contacts!left(first_name, last_name),
       companies!left(name)`,
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(from, to);

  if (filters.search) {
    const q = filters.search.trim();
    query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`);
  }

  if (filters.status && filters.status.length > 0) {
    query = query.in('status', filters.status);
  }

  if (filters.priority && filters.priority.length > 0) {
    query = query.in('priority', filters.priority);
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  const total      = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const tickets: PagedTicket[] = ((data ?? []) as any[]).map((t: any) => ({
    id:                t.id,
    title:             t.title,
    description:       t.description,
    notes:             t.notes,
    priority:          t.priority,
    status:            t.status,
    category:          t.category,
    assigned_to_email: t.assigned_to_email,
    github_issue_url:  t.github_issue_url,
    created_at:        t.created_at,
    created_by:        t.created_by,
    lead_id:           t.lead_id,
    contact_id:        t.contact_id,
    company_id:        t.company_id,
    lead_name:    t.leads?.name ?? null,
    contact_name: t.contacts
      ? `${t.contacts.first_name ?? ''} ${t.contacts.last_name ?? ''}`.trim() || null
      : null,
    company_name: t.companies?.name ?? null,
  }));

  return {
    data: tickets,
    count:      total,
    page,
    pageSize,
    totalPages,
    hasNext:    page < totalPages,
    hasPrev:    page > 1,
  };
}

// ── WRITE — Edge Functions only ───────────────────────────────────────────────

export async function createTicket(input: TicketInput): Promise<Ticket> {
  const parsed = TicketSchema.parse(input);

  const res = await callEdgeFunction<ApiResponse<Ticket>>('create-ticket', {
    title:             parsed.title,
    description:       parsed.description       || null,
    notes:             parsed.notes             || null,
    priority:          parsed.priority,
    status:            parsed.status,
    category:          parsed.category          || null,
    assigned_to_email: parsed.assigned_to_email || null,
    github_issue_url:  parsed.github_issue_url  || null,
    lead_id:           parsed.lead_id           ?? null,
    contact_id:        parsed.contact_id        ?? null,
    company_id:        parsed.company_id        ?? null,
  });

  if (!res.success || !res.data) throw new Error(res.error ?? 'Failed to create ticket');
  return res.data;
}

export async function updateTicket(
  id: string,
  input: Partial<TicketInput>
): Promise<void> {
  const payload: Record<string, unknown> = { ticketId: id };

  if (input.title             !== undefined) payload.title             = input.title?.trim();
  if (input.description       !== undefined) payload.description       = input.description       || null;
  if (input.notes             !== undefined) payload.notes             = input.notes             || null;
  if (input.priority          !== undefined) payload.priority          = input.priority;
  if (input.status            !== undefined) payload.status            = input.status;
  if (input.category          !== undefined) payload.category          = input.category          || null;
  if (input.assigned_to_email !== undefined) payload.assigned_to_email = input.assigned_to_email || null;
  if (input.github_issue_url  !== undefined) payload.github_issue_url  = input.github_issue_url  || null;
  if (input.lead_id           !== undefined) payload.lead_id           = input.lead_id;
  if (input.contact_id        !== undefined) payload.contact_id        = input.contact_id;
  if (input.company_id        !== undefined) payload.company_id        = input.company_id;

  const res = await callEdgeFunction<ApiResponse>('update-ticket', payload);
  if (!res.success) throw new Error(res.error ?? 'Failed to update ticket');
}

export async function deleteTicket(id: string): Promise<void> {
  const res = await callEdgeFunction<ApiResponse>('delete-ticket', { ticketId: id });
  if (!res.success) throw new Error(res.error ?? 'Failed to delete ticket');
}

export async function toggleTicketStatus(
  ticket: Pick<Ticket, 'id' | 'status'>
): Promise<Ticket['status']> {
  const newStatus: Ticket['status'] =
    ticket.status === 'resolved' ? 'open' : 'resolved';

  const res = await callEdgeFunction<ApiResponse<{ status: Ticket['status'] }>>('update-ticket', {
    ticketId: ticket.id,
    status:   newStatus,
  });

  if (!res.success) throw new Error(res.error ?? 'Failed to toggle ticket status');
  return res.data?.status ?? newStatus;
}