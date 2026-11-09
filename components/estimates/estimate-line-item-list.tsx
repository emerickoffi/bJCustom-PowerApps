'use client'

import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatCentsExact, formatQuantity, type EstimateCategory } from '@/lib/estimates'
import { rowMath, type RowErrors, type SheetRow } from '@/lib/estimate-sheet'
import { cn } from '@/lib/utils'

const iconButton =
  'inline-flex size-9 items-center justify-center rounded-md text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50'

/** Read-friendly list of line items grouped by category. Editing happens in the drawer. */
export function EstimateLineItemList({
  groups,
  collapsed,
  errorsByKey,
  editable,
  locked,
  onToggleGroup,
  onAdd,
  onEdit,
  onDelete,
  onRemoveCategory,
}: {
  groups: [EstimateCategory, SheetRow[]][]
  collapsed: Set<EstimateCategory>
  errorsByKey: Map<string, RowErrors>
  editable: boolean
  locked: boolean
  onToggleGroup: (category: EstimateCategory) => void
  onAdd: (category: EstimateCategory | null) => void
  onEdit: (key: string) => void
  onDelete: (key: string) => void
  onRemoveCategory: (category: EstimateCategory) => void
}) {
  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
        <p className="text-sm text-muted-foreground">
          {editable ? 'No line items yet. Add the first cost item to start pricing this estimate.' : 'This estimate has no line items.'}
        </p>
        {editable && (
          <Button type="button" onClick={() => onAdd(null)} disabled={locked} data-add-line="">
            <Plus data-icon="inline-start" />
            Add line item
          </Button>
        )}
      </div>
    )
  }

  return (
    <table className="w-full table-fixed border-collapse text-left">
      <caption className="sr-only">
        {'Estimate line items grouped by category. Line total equals quantity times unit cost.'}
      </caption>
      <thead className="bg-table-head text-xs font-medium text-[#526173]">
        <tr className="border-b">
          <th scope="col" className="px-3 py-2 sm:px-4">Description</th>
          <th scope="col" className="hidden w-32 px-3 py-2 text-right sm:table-cell">Quantity</th>
          <th scope="col" className="hidden w-32 px-3 py-2 text-right md:table-cell">Unit cost</th>
          <th scope="col" className="w-32 px-3 py-2 text-right">Line total</th>
          {editable && (
            <th scope="col" className="w-[5.25rem] px-2 py-2 text-center">
              <span className="sr-only">Actions</span>
            </th>
          )}
        </tr>
      </thead>
      {groups.map(([cat, list]) => {
        const isEmpty = list.length === 0
        const isCollapsed = !isEmpty && collapsed.has(cat)
        const subtotal = list.reduce((sum, r) => sum + rowMath(r).totalCents, 0)
        return (
          <tbody key={cat}>
            <tr className="border-b bg-sage/40">
              <th scope="rowgroup" colSpan={5} className="py-1 pr-1 pl-2 text-left font-normal">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <GroupLabel cat={cat} count={list.length} isEmpty={isEmpty} isCollapsed={isCollapsed} onToggle={onToggleGroup} />
                  <div className={cn('flex shrink-0 items-center gap-0.5', !editable && 'pr-2')}>
                    {!isEmpty && (
                      <span className="mr-1 text-sm font-semibold tabular-nums text-foreground">
                        <span className="sr-only">Subtotal </span>
                        {formatCentsExact(subtotal)}
                      </span>
                    )}
                    {editable && (
                      <>
                    <button
                      type="button"
                      data-add-line={cat}
                      disabled={locked}
                      onClick={() => onAdd(cat)}
                      title={`Add line item to ${cat}`}
                      aria-label={`Add line item to ${cat}`}
                      className={cn(iconButton, 'hover:bg-primary/10 hover:text-primary')}
                    >
                      <Plus className="size-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => onRemoveCategory(cat)}
                      title="Remove category"
                      aria-label={`Remove category, ${cat}`}
                      className={cn(iconButton, 'hover:bg-destructive/10 hover:text-destructive')}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                      </>
                    )}
                  </div>
                </div>
              </th>
            </tr>
            {!isCollapsed &&
              list.map((row) => (
                <ItemRow
                  key={row.key}
                  row={row}
                  invalid={Object.keys(errorsByKey.get(row.key) ?? {}).length > 0}
                  editable={editable}
                  locked={locked}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))}
          </tbody>
        )
      })}
    </table>
  )
}

function GroupLabel({
  cat,
  count,
  isEmpty,
  isCollapsed,
  onToggle,
}: {
  cat: EstimateCategory
  count: number
  isEmpty: boolean
  isCollapsed: boolean
  onToggle: (cat: EstimateCategory) => void
}) {
  if (isEmpty) {
    return (
      <span className="flex items-center gap-2 px-1 py-1.5 text-sm">
        <span className="font-semibold text-foreground">{cat}</span>
        <span className="text-muted-foreground">No items</span>
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={() => onToggle(cat)}
      aria-expanded={!isCollapsed}
      className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-md px-1 text-left text-sm font-semibold text-foreground hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {isCollapsed ? <ChevronRight className="size-4 shrink-0" aria-hidden="true" /> : <ChevronDown className="size-4 shrink-0" aria-hidden="true" />}
      <span className="truncate">{cat}</span>
      <span className="font-normal text-muted-foreground">{`(${count})`}</span>
    </button>
  )
}

function ItemRow({
  row,
  invalid,
  editable,
  locked,
  onEdit,
  onDelete,
}: {
  row: SheetRow
  invalid: boolean
  editable: boolean
  locked: boolean
  onEdit: (key: string) => void
  onDelete: (key: string) => void
}) {
  const math = rowMath(row)
  const label = row.description.trim() || 'Untitled line item'
  const qty = `${formatQuantity(row.quantity)} ${row.unit}`
  return (
    <tr className={cn('border-b border-border/60 align-top hover:bg-sage/20', row.is_allowance && 'bg-link-soft/40')}>
      <td className="min-w-0 px-3 py-2.5 sm:px-4">
        <p className="truncate text-sm font-medium text-foreground" title={label}>
          {label}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="tabular-nums sm:hidden">{`${qty} × ${formatCentsExact(math.unitCostCents)}`}</span>
          {row.is_allowance && <span className="rounded-badge bg-link-soft px-2 py-0.5 font-medium text-foreground">Allowance</span>}
          {invalid && <span className="rounded-badge bg-destructive/10 px-2 py-0.5 font-medium text-destructive">Needs attention</span>}
          {row.notes.trim() && <span className="min-w-0 max-w-full truncate">{row.notes}</span>}
        </div>
      </td>
      <td className="hidden px-3 py-2.5 text-right text-sm tabular-nums text-foreground sm:table-cell">{qty}</td>
      <td className="hidden px-3 py-2.5 text-right text-sm tabular-nums text-muted-foreground md:table-cell">
        {formatCentsExact(math.unitCostCents)}
      </td>
      <td className="px-3 py-2.5 text-right text-sm font-semibold tabular-nums text-foreground">
        {math.valid ? formatCentsExact(math.totalCents) : '—'}
      </td>
      {editable && (
        <td className="px-1 py-1.5">
          <div className="flex items-center justify-end gap-0.5">
            <button
              type="button"
              data-edit-row={row.key}
              disabled={locked}
              onClick={() => onEdit(row.key)}
              title="Edit line item"
              aria-label={`Edit line item, ${label}`}
              className={cn(iconButton, 'hover:bg-muted hover:text-foreground')}
            >
              <Pencil className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              data-remove-row={row.key}
              disabled={locked}
              onClick={() => onDelete(row.key)}
              title="Remove line item"
              aria-label={`Remove line item, ${label}`}
              className={cn(iconButton, 'hover:bg-destructive/10 hover:text-destructive')}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </div>
        </td>
      )}
    </tr>
  )
}
