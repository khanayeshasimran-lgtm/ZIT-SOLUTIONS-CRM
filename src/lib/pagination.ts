/**
 * lib/pagination.ts
 *
 * Server-side pagination helpers.
 *
 * Replaces the pattern:  .select('*').limit(500)
 * With:                  paginate(query, { page, pageSize })
 *
 * Usage:
 *   const { data, count, totalPages } = await paginate(
 *     supabase.from('leads').select('*', { count: 'exact' }).order('created_at', { ascending: false }),
 *     { page: 1, pageSize: 25 }
 *   );
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export interface PaginationParams {
  page:     number;    // 1-based
  pageSize: number;
}

export interface PaginatedResult<T> {
  data:       T[];
  count:      number;   // total rows matching query
  page:       number;
  pageSize:   number;
  totalPages: number;
  hasNext:    boolean;
  hasPrev:    boolean;
}

// ── Core paginator ─────────────────────────────────────────────────────────────

/**
 * Wraps a Supabase query builder and applies range-based pagination.
 * The query MUST include { count: 'exact' } in the select call.
 *
 * @example
 * const result = await paginate(
 *   supabase.from('deals').select('*', { count: 'exact' }),
 *   { page: 2, pageSize: 20 }
 * );
 */
export async function paginate<T>(
  query: any,
  { page, pageSize }: PaginationParams
): Promise<PaginatedResult<T>> {
  const safePage     = Math.max(1, page);
  const safePageSize = Math.min(Math.max(1, pageSize), 100); // cap at 100
  const from         = (safePage - 1) * safePageSize;
  const to           = from + safePageSize - 1;

  const { data, error, count } = await query.range(from, to);

  if (error) throw new Error(error.message);

  const total      = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));

  return {
    data:       (data ?? []) as T[],
    count:      total,
    page:       safePage,
    pageSize:   safePageSize,
    totalPages,
    hasNext:    safePage < totalPages,
    hasPrev:    safePage > 1,
  };
}

// ── React state helper ─────────────────────────────────────────────────────────

export interface PaginationState {
  page:     number;
  pageSize: number;
}

export const DEFAULT_PAGE_SIZE = 25;

export function initialPaginationState(pageSize = DEFAULT_PAGE_SIZE): PaginationState {
  return { page: 1, pageSize };
}

export function nextPage(state: PaginationState): PaginationState {
  return { ...state, page: state.page + 1 };
}

export function prevPage(state: PaginationState): PaginationState {
  return { ...state, page: Math.max(1, state.page - 1) };
}

export function goToPage(state: PaginationState, page: number): PaginationState {
  return { ...state, page: Math.max(1, page) };
}

export function resetPage(state: PaginationState): PaginationState {
  return { ...state, page: 1 };
}