/**
 * src/hooks/useServerPagination.ts
 *
 * DAY 3 — new hook. Needed by Leads.tsx, Tickets.tsx, AuditLogs.tsx.
 *
 * Wraps React Query with a server-side paginated interface.
 * Replaces the old usePagination which fetched EVERYTHING then sliced in the browser.
 *
 * Usage:
 *   const { data, count, page, totalPages, isLoading, setPage, setPageSize } =
 *     useServerPagination({
 *       queryKey: ['leads', search, JSON.stringify(filters)],
 *       fetcher:  ({ page, pageSize }) => fetchLeadsPaged(page, pageSize, filters),
 *       pageSize: 20,
 *       enabled:  !!user,
 *     });
 */

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useState } from 'react';

export interface PagedResult<T> {
  data:       T[];
  count:      number;
  page:       number;
  pageSize:   number;
  totalPages: number;
  hasNext:    boolean;
  hasPrev:    boolean;
}

interface UseServerPaginationOptions<T> {
  queryKey:  unknown[];
  fetcher:   (params: { page: number; pageSize: number }) => Promise<PagedResult<T>>;
  pageSize?: number;
  enabled?:  boolean;
}

export function useServerPagination<T>({
  queryKey,
  fetcher,
  pageSize: initialPageSize = 20,
  enabled = true,
}: UseServerPaginationOptions<T>) {
  const [page,     setPage]     = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  // Full key includes page + pageSize so React Query caches each page separately
  const fullKey = [...queryKey, page, pageSize];

  const { data, isLoading, isFetching, isError, error } = useQuery({
    queryKey:        fullKey,
    queryFn:         () => fetcher({ page, pageSize }),
    enabled,
    staleTime:       30_000,
    // keepPreviousData: shows current page while next page loads — no blank flash
    placeholderData: keepPreviousData,
  });

  const handleSetPage = (p: number) => setPage(p);

  // When page size changes, reset to page 1 to avoid out-of-range page
  const handleSetPageSize = (ps: number) => {
    setPageSize(ps);
    setPage(1);
  };

  return {
    data:       data?.data       ?? [],
    count:      data?.count      ?? 0,
    page:       data?.page       ?? page,
    pageSize:   data?.pageSize   ?? pageSize,
    totalPages: data?.totalPages ?? 1,
    hasNext:    data?.hasNext    ?? false,
    hasPrev:    data?.hasPrev    ?? false,
    isLoading,
    isFetching,
    isError,
    error,
    setPage:     handleSetPage,
    setPageSize: handleSetPageSize,
  };
}