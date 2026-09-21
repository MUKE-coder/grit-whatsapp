"use client";

import { useT } from "@/lib/i18n";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import type { ColumnDefinition, RowActionDefinition } from "@/lib/resource";
import { ColumnHeader } from "./column-header";
import { renderCell } from "./cell-renderers";
import { TableSkeleton } from "./table-skeleton";
import { TableEmptyState } from "./table-empty-state";
import { Eye, ArrowUpRight, Copy, Check } from "@/lib/icons";

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  if (!path.includes(".")) return obj[path];
  return path.split(".").reduce<unknown>(
    (acc, key) => acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined,
    obj
  );
}

// ClickableCell wraps a rendered cell when the column defines onClick. The two
// built-ins ("link" → open the row, "copy" → copy the value) get an affordance
// icon on hover; a custom function is called with (value, row). stopPropagation
// keeps the cell click from bubbling to the row.
function ClickableCell({
  column,
  value,
  row,
  onView,
  children,
}: {
  column: ColumnDefinition;
  value: unknown;
  row: Record<string, unknown>;
  onView?: (item: Record<string, unknown>) => void;
  children: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const behavior = column.onClick;
  if (!behavior) return <>{children}</>;

  const handle = (e: MouseEvent) => {
    e.stopPropagation();
    if (behavior === "link") {
      onView?.(row);
    } else if (behavior === "copy") {
      const text = value == null ? "" : String(value);
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }
    } else if (typeof behavior === "function") {
      behavior(value, row);
    }
  };

  const title =
    behavior === "link" ? "Open" : behavior === "copy" ? "Copy" : undefined;

  return (
    <button
      type="button"
      onClick={handle}
      title={title}
      className="group/cell inline-flex max-w-full items-center gap-1.5 text-left hover:text-accent transition-colors"
    >
      <span className="truncate">{children}</span>
      {behavior === "link" && (
        <ArrowUpRight className="h-3 w-3 shrink-0 opacity-0 group-hover/cell:opacity-60 transition-opacity" />
      )}
      {behavior === "copy" &&
        (copied ? (
          <Check className="h-3 w-3 shrink-0 text-success" />
        ) : (
          <Copy className="h-3 w-3 shrink-0 opacity-0 group-hover/cell:opacity-60 transition-opacity" />
        ))}
    </button>
  );
}

// Generic in the row type so a typed customisation can wrap it. A
// ResourceCustomisation<Product> hands its Table slot Product[], and without
// the type parameter (props) => <Card><DataTable {...props} /></Card> would not
// compile — Product has no index signature.
interface DataTableProps<T extends object = Record<string, unknown>> {
  columns: ColumnDefinition<T>[];
  data: T[];
  isLoading?: boolean;
  /** Refetching with rows on screen: they stay, and a bar shows above them. */
  isFetching?: boolean;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  onSort?: (key: string) => void;
  selectedRows?: string[];
  onSelectRows?: (rows: string[]) => void;
  onView?: (item: T) => void;
  onEdit?: (item: T) => void;
  onDelete?: (id: string) => void;
  /** Extra per-row actions from the resource's table.rowActions. */
  rowActions?: RowActionDefinition[];
}

// The default for selectedRows. A fresh [] per render would rebuild the
// selection Set below on every render of a table nobody is selecting in.
const noSelection: string[] = [];

export function DataTable<T extends object = Record<string, unknown>>({
  columns: columnsProp,
  data: dataProp,
  isLoading,
  isFetching,
  sortBy,
  sortOrder,
  onSort,
  selectedRows = noSelection,
  onSelectRows,
  onView: onViewProp,
  onEdit: onEditProp,
  onDelete,
  rowActions,
}: DataTableProps<T>) {
  // The row type is erased once, here. Everything below reads cells by string
  // key, and a concrete interface has no index signature to read them through.
  // Doing it at the boundary keeps the cast in one place instead of scattering
  // it through the render.
  const columns = columnsProp as unknown as ColumnDefinition[];
  const data = dataProp as unknown as Record<string, unknown>[];
  const onView = onViewProp as ((item: Record<string, unknown>) => void) | undefined;
  const onEdit = onEditProp as ((item: Record<string, unknown>) => void) | undefined;
  const t = useT();

  // One Set per selection change, so each row asks "am I selected?" in
  // constant time. selectedRows.includes per row made a page of 100 rows with
  // 100 selected do 10,000 comparisons on every render.
  const selected = useMemo(() => new Set(selectedRows), [selectedRows]);
  const allIds = useMemo(() => data.map((row) => String(row.id)), [data]);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));

  // toggleRow reads the selection through a ref so its identity survives a
  // selection change. That is what lets the memoised rows below skip
  // re-rendering: ticking one box re-renders one row, not the page.
  const selectionRef = useRef(selectedRows);
  useEffect(() => {
    selectionRef.current = selectedRows;
  }, [selectedRows]);
  const toggleRow = useCallback(
    (id: string) => {
      if (!onSelectRows) return;
      const current = selectionRef.current;
      onSelectRows(current.includes(id) ? current.filter((r) => r !== id) : [...current, id]);
    },
    [onSelectRows],
  );

  if (isLoading) {
    return <TableSkeleton columns={columns.length + (onSelectRows ? 1 : 0) + (onView || onEdit || onDelete || (rowActions && rowActions.length) ? 1 : 0)} />;
  }

  if (data.length === 0) {
    return <TableEmptyState />;
  }

  const toggleAll = () => {
    if (!onSelectRows) return;
    onSelectRows(allSelected ? [] : allIds);
  };

  const hasActions = Boolean(onView || onEdit || onDelete || (rowActions && rowActions.length > 0));

  return (
    <div className="relative overflow-x-auto" aria-busy={isFetching || undefined}>
      {isFetching && (
        <div aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 animate-pulse bg-accent" />
      )}
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            {onSelectRows && (
              <th className="w-[48px] px-4 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-border bg-bg-tertiary accent-accent"
                />
              </th>
            )}
            {columns.map((col) => (
              <ColumnHeader
                key={col.key}
                column={col}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={onSort}
              />
            ))}
            {hasActions && (
              <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase tracking-wider w-[140px]">
                {t("table.actions", "Actions")}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => {
            const id = allIds[idx];
            return (
              <DataTableRow
                key={id || idx}
                id={id}
                row={row}
                columns={columns}
                isSelected={selected.has(id)}
                selectable={Boolean(onSelectRows)}
                onToggle={toggleRow}
                hasActions={hasActions}
                onView={onView}
                onEdit={onEdit}
                onDelete={onDelete}
                rowActions={rowActions}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface DataTableRowProps {
  id: string;
  row: Record<string, unknown>;
  columns: ColumnDefinition[];
  isSelected: boolean;
  selectable: boolean;
  onToggle: (id: string) => void;
  hasActions: boolean;
  onView?: (item: Record<string, unknown>) => void;
  onEdit?: (item: Record<string, unknown>) => void;
  onDelete?: (id: string) => void;
  rowActions?: RowActionDefinition[];
}

// One row, memoised: it re-renders when its own row, its selected state or the
// table's column and action props change, and not when a neighbour is ticked.
const DataTableRow = memo(function DataTableRow({
  id,
  row,
  columns,
  isSelected,
  selectable,
  onToggle,
  hasActions,
  onView,
  onEdit,
  onDelete,
  rowActions,
}: DataTableRowProps) {
  const t = useT();

  return (
    <tr
      className={` border-b border-border/50 transition-colors ${
        isSelected ? "bg-accent/5" : "hover:bg-bg-hover/50"
      }`}
    >
      {selectable && (
        <td className="px-4 py-3">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggle(id)}
            className="h-4 w-4 rounded border-border bg-bg-tertiary accent-accent"
          />
        </td>
      )}
      {columns.map((col) => {
        // Read once: the value feeds both the click wrapper and the renderer.
        const value = getNestedValue(row, col.key);
        return (
          <td
            key={col.key}
            className="px-4 py-3 text-sm text-foreground"
            style={col.width ? { width: col.width } : undefined}
          >
            <ClickableCell column={col} value={value} row={row} onView={onView}>
              {renderCell(col, value, row)}
            </ClickableCell>
          </td>
        );
      })}
      {hasActions && (
        <td className="px-4 py-3 text-right text-sm">
          <div className="flex items-center justify-end gap-2">
            {onView && (
              <button
                onClick={() => onView(row)}
                className="rounded-md p-1.5 text-text-secondary hover:text-info hover:bg-info/10 transition-colors"
                title={t("table.view", "View")}
              >
                <Eye className="h-3.5 w-3.5" />
              </button>
            )}
            {onEdit && (
              <button
                onClick={() => onEdit(row)}
                className="text-xs text-text-secondary hover:text-accent transition-colors"
              >
                {t("form.edit", "Edit")}
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => onDelete(id)}
                className="text-xs text-text-secondary hover:text-danger transition-colors"
              >
                {t("form.delete", "Delete")}
              </button>
            )}
            {(rowActions ?? [])
              .filter((a) => !a.visible || a.visible(row))
              .map((a) =>
                a.href ? (
                  <Link
                    key={a.label}
                    href={a.href(row)}
                    className={
                      "text-xs transition-colors " +
                      (a.variant === "danger"
                        ? "text-text-secondary hover:text-danger"
                        : "text-text-secondary hover:text-accent")
                    }
                  >
                    {a.label}
                  </Link>
                ) : (
                  <button
                    key={a.label}
                    onClick={() => a.onClick?.(row)}
                    className={
                      "text-xs transition-colors " +
                      (a.variant === "danger"
                        ? "text-text-secondary hover:text-danger"
                        : "text-text-secondary hover:text-accent")
                    }
                  >
                    {a.label}
                  </button>
                )
              )}
          </div>
        </td>
      )}
    </tr>
  );
});
