'use client'

import { memo } from 'react'
import { MoreHorizontal } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ESTIMATE_CATEGORIES, formatCentsExact, formatQuantity, type EstimateCategory } from '@/lib/estimates'
import { parseCents, rowMath, type RowErrors, type SheetColumn, type SheetRow } from '@/lib/estimate-sheet'
import { cn } from '@/lib/utils'

export type RowCommand =
  | { type: 'insert-above' | 'insert-below' | 'duplicate' | 'move-up' | 'move-down' | 'delete' | 'toggle-allowance' }
  | { type: 'move-category'; category: EstimateCategory }

const NUMERIC: SheetColumn[] = ['quantity', 'material', 'labor', 'other']

const COLUMN_LABEL: Record<SheetColumn, string> = {
  description: 'Description',
  quantity: 'Quantity',
  unit: 'Unit',
  material: 'Material per unit',
  labor: 'Labor per unit',
  other: 'Other per unit',
  notes: 'Notes',
}

function Cell({
  row,
  col,
  error,
  showError,
  readOnly,
  onChange,
}: {
  row: SheetRow
  col: SheetColumn
  error?: string
  showError: boolean
  readOnly: boolean
  onChange: (key: string, col: SheetColumn, value: string) => void
}) {
  const numeric = NUMERIC.includes(col)
  const money = col === 'material' || col === 'labor' || col === 'other'
  const invalid = showError && Boolean(error)
  const errorId = invalid ? `err-${row.key}-${col}` : undefined
  return (
    <td className={cn('relative border-r border-border/60 p-0', invalid && 'bg-destructive/5')}>
      {money && (
        <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-xs text-muted-foreground">
          $
        </span>
      )}
      <input
        data-cell={`${row.key}|${col}`}
        value={row[col]}
        readOnly={readOnly}
        inputMode={numeric ? 'decimal' : undefined}
        autoComplete="off"
        spellCheck={col === 'description' || col === 'notes'}
        aria-label={`${COLUMN_LABEL[col]}, ${row.description || 'new line item'}`}
        aria-invalid={invalid || undefined}
        aria-describedby={errorId}
        title={invalid ? error : undefined}
        placeholder={col === 'description' ? 'Describe the item' : col === 'notes' ? 'Optional' : undefined}
        onChange={(e) => onChange(row.key, col, e.target.value)}
        className={cn(
          'h-10 w-full bg-transparent px-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/60',
          'focus:relative focus:z-[1] focus:bg-background focus:ring-2 focus:ring-ring focus:ring-inset',
          numeric && 'text-right tabular-nums',
          money && 'pl-5',
          invalid && 'ring-1 ring-destructive ring-inset',
        )}
      />
      {invalid && (
        <span id={errorId} className="sr-only">
          {error}
        </span>
      )}
    </td>
  )
}

function ReadCell({ children, numeric, className }: { children: React.ReactNode; numeric?: boolean; className?: string }) {
  return (
    <td
      className={cn(
        'h-10 border-r border-border/60 px-2 text-sm text-foreground',
        numeric && 'text-right tabular-nums',
        className,
      )}
    >
      {children}
    </td>
  )
}

const moneyText = (raw: string) => formatCentsExact(parseCents(raw) ?? 0)

export const SheetRowView = memo(function SheetRowView({
  row,
  index,
  errors,
  showErrors,
  editable,
  locked,
  onChange,
  onToggleAllowance,
  onCommand,
}: {
  row: SheetRow
  index: number
  errors: RowErrors
  showErrors: boolean
  editable: boolean
  locked: boolean
  onChange: (key: string, col: SheetColumn, value: string) => void
  onToggleAllowance: (key: string) => void
  onCommand: (key: string, command: RowCommand) => void
}) {
  const math = rowMath(row)
  const cellProps = (col: SheetColumn) => ({
    row,
    col,
    error: errors[col],
    // Format problems show immediately; missing required values only after a save attempt.
    showError: showErrors || (col !== 'description' && col !== 'unit'),
    readOnly: locked,
    onChange,
  })

  return (
    <tr className={cn('group border-b border-border/60 hover:bg-sage/30', row.is_allowance && 'bg-champagne-soft/40')}>
      <th scope="row" className="h-10 border-r border-border/60 px-2 text-right text-xs font-normal tabular-nums text-muted-foreground">
        {index}
      </th>
      {editable ? (
        <>
          <Cell {...cellProps('description')} />
          <Cell {...cellProps('quantity')} />
          <Cell {...cellProps('unit')} />
          <Cell {...cellProps('material')} />
          <Cell {...cellProps('labor')} />
          <Cell {...cellProps('other')} />
        </>
      ) : (
        <>
          <ReadCell className="truncate">
            <span className="font-medium">{row.description}</span>
          </ReadCell>
          <ReadCell numeric>{formatQuantity(row.quantity)}</ReadCell>
          <ReadCell>{row.unit}</ReadCell>
          <ReadCell numeric>{moneyText(row.material)}</ReadCell>
          <ReadCell numeric>{moneyText(row.labor)}</ReadCell>
          <ReadCell numeric>{moneyText(row.other)}</ReadCell>
        </>
      )}
      <ReadCell numeric className="bg-muted/30 text-muted-foreground">
        {formatCentsExact(math.unitCostCents)}
      </ReadCell>
      <ReadCell numeric className="bg-muted/30 font-semibold">
        {math.valid ? formatCentsExact(math.totalCents) : '—'}
      </ReadCell>
      <td className="h-10 border-r border-border/60 text-center">
        <input
          type="checkbox"
          checked={row.is_allowance}
          disabled={!editable || locked}
          onChange={() => onToggleAllowance(row.key)}
          aria-label={`Allowance, ${row.description || 'new line item'}`}
          className="size-4 accent-primary"
        />
      </td>
      {editable ? (
        <Cell {...cellProps('notes')} />
      ) : (
        <ReadCell className="truncate text-muted-foreground">{row.notes || '—'}</ReadCell>
      )}
      {editable && (
        <td className="h-10 px-1 text-center">
          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={locked}
              aria-label={`Row actions, ${row.description || 'new line item'}`}
              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <MoreHorizontal className="size-4" aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={() => onCommand(row.key, { type: 'insert-above' })}>Insert row above</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onCommand(row.key, { type: 'insert-below' })}>Insert row below</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onCommand(row.key, { type: 'duplicate' })}>Duplicate row</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onCommand(row.key, { type: 'move-up' })}>Move up</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onCommand(row.key, { type: 'move-down' })}>Move down</DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Move to category</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-80 overflow-y-auto">
                  {ESTIMATE_CATEGORIES.filter((c) => c !== row.category).map((c) => (
                    <DropdownMenuItem key={c} onClick={() => onCommand(row.key, { type: 'move-category', category: c })}>
                      {c}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => onCommand(row.key, { type: 'delete' })}>
                Delete row
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </td>
      )}
    </tr>
  )
})
