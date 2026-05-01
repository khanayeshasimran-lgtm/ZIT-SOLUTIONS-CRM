 /**
 * components/PaginationControls.tsx
 *
 * Drop this below any DataTable. Reads from usePagination's paginationProps.
 *
 * Usage:
 *   <DataTable data={paginatedData} columns={columns} ... />
 *   <PaginationControls {...paginationProps} />
 */

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { PaginationProps } from '@/hooks/usePagination';

interface Props extends PaginationProps {
  pageSizeOptions?: number[];
}

export function PaginationControls({
  page,
  pageSize,
  totalCount,
  totalPages,
  hasPrev,
  hasNext,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
}: Props) {
  if (totalCount === 0) return null;

  const from = Math.min((page - 1) * pageSize + 1, totalCount);
  const to   = Math.min(page * pageSize, totalCount);

  // Build visible page numbers (max 5 shown, with ellipsis)
  const pageNumbers: (number | '...')[] = [];
  if (totalPages <= 5) {
    for (let i = 1; i <= totalPages; i++) pageNumbers.push(i);
  } else {
    pageNumbers.push(1);
    if (page > 3) pageNumbers.push('...');
    const start = Math.max(2, page - 1);
    const end   = Math.min(totalPages - 1, page + 1);
    for (let i = start; i <= end; i++) pageNumbers.push(i);
    if (page < totalPages - 2) pageNumbers.push('...');
    pageNumbers.push(totalPages);
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-1 py-3 border-t border-border">
      {/* Left: showing X–Y of Z */}
      <p className="text-sm text-muted-foreground order-2 sm:order-1">
        Showing <span className="font-medium text-foreground">{from}–{to}</span> of{' '}
        <span className="font-medium text-foreground">{totalCount}</span>
      </p>

      {/* Centre: page controls */}
      <div className="flex items-center gap-1 order-1 sm:order-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!hasPrev}
          onClick={() => onPageChange(page - 1)}
          className="h-8 w-8 p-0"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        {pageNumbers.map((n, i) =>
          n === '...' ? (
            <span key={`ellipsis-${i}`} className="px-1 text-muted-foreground text-sm">
              …
            </span>
          ) : (
            <Button
              key={n}
              variant={n === page ? 'default' : 'outline'}
              size="sm"
              onClick={() => onPageChange(n as number)}
              className="h-8 w-8 p-0 text-xs"
            >
              {n}
            </Button>
          )
        )}

        <Button
          variant="outline"
          size="sm"
          disabled={!hasNext}
          onClick={() => onPageChange(page + 1)}
          className="h-8 w-8 p-0"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Right: rows per page */}
      <div className="flex items-center gap-2 order-3">
        <span className="text-sm text-muted-foreground whitespace-nowrap">Rows per page</span>
        <Select
          value={String(pageSize)}
          onValueChange={v => onPageSizeChange(Number(v))}
        >
          <SelectTrigger className="h-8 w-[70px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizeOptions.map(n => (
              <SelectItem key={n} value={String(n)}>{n}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}