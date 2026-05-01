/**
 * hooks/usePagination.ts
 *
 * Simple client-side pagination hook.
 * Works with already-fetched arrays — no extra DB calls.
 *
 * For server-side pagination (large datasets), swap the
 * `paginatedData` computation with a Supabase range query.
 *
 * Usage:
 *   const { paginatedData, paginationProps } = usePagination(leads, 20);
 *   <DataTable data={paginatedData} {...} />
 *   <PaginationControls {...paginationProps} />
 */

import { useState, useMemo, useEffect } from 'react';

export interface PaginationProps {
  page:       number;
  pageSize:   number;
  totalCount: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  hasPrev: boolean;
  hasNext: boolean;
}

export function usePagination<T>(
  data: T[],
  defaultPageSize = 20
): { paginatedData: T[]; paginationProps: PaginationProps } {
  const [page, setPage]           = useState(1);
  const [pageSize, setPageSize]   = useState(defaultPageSize);

  // Reset to page 1 whenever the source data or page size changes
  useEffect(() => { setPage(1); }, [data.length, pageSize]);

  const totalCount = data.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // Clamp current page if data shrinks
  const safePage = Math.min(page, totalPages);

  const paginatedData = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return data.slice(start, start + pageSize);
  }, [data, safePage, pageSize]);

  return {
    paginatedData,
    paginationProps: {
      page:      safePage,
      pageSize,
      totalCount,
      totalPages,
      hasPrev:   safePage > 1,
      hasNext:   safePage < totalPages,
      onPageChange:     (p: number) => setPage(Math.max(1, Math.min(p, totalPages))),
      onPageSizeChange: (s: number) => { setPageSize(s); setPage(1); },
    },
  };
}