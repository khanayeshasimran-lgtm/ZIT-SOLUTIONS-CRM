import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './table';
import { EmptyState } from './EmptyState';
import { LucideIcon } from 'lucide-react';

interface Column<T> {
  key: keyof T | string;
  header: string;
  render?: (item: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  emptyIcon: LucideIcon;
  emptyTitle: string;
  emptyDescription: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  onRowClick?: (item: T) => void;
}

export function DataTable<T extends { id: string }>({
  columns,
  data,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  emptyActionLabel,
  onEmptyAction,
  onRowClick,
}: DataTableProps<T>) {
  if (data.length === 0) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle}
        description={emptyDescription}
        actionLabel={emptyActionLabel}
        onAction={onEmptyAction}
      />
    );
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="table-header">
            {columns.map((column) => (
              <TableHead key={String(column.key)}>{column.header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((item) => (
            <TableRow
              key={item.id}
              className={onRowClick ? 'cursor-pointer hover:bg-muted/50' : ''}
              onClick={() => onRowClick?.(item)}
            >
              {columns.map((column) => (
              <TableCell
                key={`${item.id}-${String(column.key)}`}
                className="align-middle"
              >
                <div className="flex items-center h-full">
                  {column.render
                    ? column.render(item)
                    : String(
                        (item as Record<string, unknown>)[
                          column.key as string
                        ] ?? ''
                      )}
                </div>
              </TableCell>
            ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
