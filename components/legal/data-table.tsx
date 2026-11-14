import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { EmptyState, ErrorState } from "./empty-state";

export interface DataTableColumn<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  /** Numeric / date columns use tabular figures. */
  numeric?: boolean;
}

interface DataTableProps<T> {
  /** Accessible table caption (visually hidden). */
  caption: string;
  columns: readonly DataTableColumn<T>[];
  rows: readonly T[];
  getRowId: (row: T) => string;
  isLoading?: boolean;
  error?: string | null;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  loadingRows?: number;
}

/**
 * Presentational table with built-in loading, empty and error states.
 * Navigation belongs in a cell (e.g. a Link on the title) so rows stay keyboard-accessible.
 */
export function DataTable<T>({
  caption,
  columns,
  rows,
  getRowId,
  isLoading = false,
  error = null,
  emptyTitle = "لا توجد بيانات",
  emptyDescription,
  emptyAction,
  loadingRows = 5,
}: DataTableProps<T>) {
  if (error) {
    return <ErrorState title="تعذّر تحميل البيانات" description={error} />;
  }

  return (
    <Table aria-busy={isLoading || undefined}>
      <caption className="sr-only">{caption}</caption>
      <TableHeader>
        <TableRow>
          {columns.map((column) => (
            <TableHead key={column.id} className={column.className}>
              {column.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading ? (
          Array.from({ length: loadingRows }, (_, index) => (
            <TableRow key={`loading-${index}`}>
              {columns.map((column) => (
                <TableCell key={column.id}>
                  <Skeleton className="h-4 w-full max-w-40" />
                </TableCell>
              ))}
            </TableRow>
          ))
        ) : rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={columns.length} className="p-0">
              <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row) => (
            <TableRow key={getRowId(row)} className="transition-colors duration-150 hover:bg-surface-muted/50">
              {columns.map((column) => (
                <TableCell key={column.id} className={cn(column.numeric && "tabular", column.className)}>
                  {column.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
