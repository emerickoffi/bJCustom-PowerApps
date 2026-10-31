'use client'

import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronRight, Lock, Plus, Redo2, Save, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/shared/form-field'
import { EstimateSummary } from '@/components/estimates/estimate-summary'
import { SheetRowView, type RowCommand } from '@/components/estimates/estimate-sheet-row'
import { saveEstimateLineItemsAction } from '@/app/actions/estimates'
import {
  ESTIMATE_CATEGORIES,
  ESTIMATE_STATUS_LABELS,
  formatCentsExact,
  type EstimateCategory,
  type EstimateLineItem,
  type EstimateStatus,
  type EstimateTotals,
} from '@/lib/estimates'
import {
  MAX_SHEET_ROWS,
  SHEET_COLUMNS,
  blankRow,
  computeTotals,
  isBlankNewRow,
  newRowKey,
  parseClipboardGrid,
  rowFromItem,
  rowMath,
  toPayload,
  validateRow,
  type RowErrors,
  type SheetColumn,
  type SheetRow,
} from '@/lib/estimate-sheet'
import { cn } from '@/lib/utils'

const categoryIndex = (c: EstimateCategory) => ESTIMATE_CATEGORIES.indexOf(c)

function initialRows(items: EstimateLineItem[]) {
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => categoryIndex(a.item.category) - categoryIndex(b.item.category) || a.i - b.i)
    .map(({ item }) => rowFromItem(item))
}

/** Rows in display order: grouped by category in catalog order, preserving order within a group. */
function ordered(rows: SheetRow[]) {
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => categoryIndex(a.row.category) - categoryIndex(b.row.category) || a.i - b.i)
    .map(({ row }) => row)
}

const serialize = (rows: SheetRow[]) => JSON.stringify(ordered(rows).filter((r) => !isBlankNewRow(r)).map(toPayload))

type History = { past: SheetRow[][]; present: SheetRow[]; future: SheetRow[][]; lastKey: string | null }
const HISTORY_LIMIT = 100

export function EstimateSheet({
  estimateId,
  items,
  status,
  editable,
  updatedAt,
  serverTotals,
}: {
  estimateId: string
  items: EstimateLineItem[]
  status: EstimateStatus
  editable: boolean
  updatedAt: string
  serverTotals: EstimateTotals
}) {
  const router = useRouter()
  const tableRef = useRef<HTMLTableElement>(null)
  const focusValue = useRef<{ cell: string; value: string } | null>(null)
  const expectedStamp = useRef(updatedAt)

  const [history, setHistory] = useState<History>(() => ({
    past: [],
    present: initialRows(items),
    future: [],
    lastKey: null,
  }))
  const [baseline, setBaseline] = useState(() => serialize(initialRows(items)))
  const [collapsed, setCollapsed] = useState<Set<EstimateCategory>>(new Set())
  const [attempted, setAttempted] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [awaitingSync, setAwaitingSync] = useState(false)
  const [syncedStamp, setSyncedStamp] = useState(updatedAt)
  const [saving, startSaving] = useTransition()

  const rows = history.present
  const dirty = editable && serialize(rows) !== baseline
  const locked = saving || awaitingSync

  // Adopt fresh server data when it arrives (after our own save, or when nothing local is pending).
  if (updatedAt !== syncedStamp) {
    setSyncedStamp(updatedAt)
    expectedStamp.current = updatedAt
    if (awaitingSync || !dirty) {
      const fresh = initialRows(items)
      setHistory({ past: [], present: fresh, future: [], lastKey: null })
      setBaseline(serialize(fresh))
      setAwaitingSync(false)
    }
  }

  const commit = useCallback((update: (rows: SheetRow[]) => SheetRow[], coalesceKey: string | null = null) => {
    setHistory((h) => {
      const next = update(h.present)
      if (next === h.present) return h
      if (coalesceKey && coalesceKey === h.lastKey) return { ...h, present: next, future: [] }
      return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: next, future: [], lastKey: coalesceKey }
    })
  }, [])

  const undo = useCallback(() => {
    setHistory((h) =>
      h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future], lastKey: null } : h,
    )
  }, [])
  const redo = useCallback(() => {
    setHistory((h) =>
      h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1), lastKey: null } : h,
    )
  }, [])

  const groups = useMemo(() => {
    const byCat = new Map<EstimateCategory, SheetRow[]>()
    for (const row of ordered(rows)) {
      const list = byCat.get(row.category) ?? []
      list.push(row)
      byCat.set(row.category, list)
    }
    return [...byCat.entries()]
  }, [rows])

  const errorsByKey = useMemo(() => {
    const map = new Map<string, RowErrors>()
    for (const row of rows) if (!isBlankNewRow(row)) map.set(row.key, validateRow(row))
    return map
  }, [rows])
  const invalidRows = useMemo(
    () => ordered(rows).filter((r) => Object.keys(errorsByKey.get(r.key) ?? {}).length > 0),
    [rows, errorsByKey],
  )

  const totals = useMemo(() => (editable ? computeTotals(rows, serverTotals) : serverTotals), [editable, rows, serverTotals])

  const focusCell = useCallback((key: string, col: SheetColumn) => {
    requestAnimationFrame(() => {
      const el = tableRef.current?.querySelector<HTMLInputElement>(`[data-cell="${CSS.escape(`${key}|${col}`)}"]`)
      el?.focus()
      el?.select()
    })
  }, [])

  const onChange = useCallback(
    (key: string, col: SheetColumn, value: string) => {
      commit((list) => list.map((r) => (r.key === key ? { ...r, [col]: value } : r)), `${key}|${col}`)
    },
    [commit],
  )

  const onToggleAllowance = useCallback(
    (key: string) => commit((list) => list.map((r) => (r.key === key ? { ...r, is_allowance: !r.is_allowance } : r))),
    [commit],
  )

  const addRow = useCallback(
    (category: EstimateCategory, afterKey?: string, beforeKey?: string) => {
      const row = blankRow(category)
      commit((list) => {
        if (list.length >= MAX_SHEET_ROWS) return list
        const anchor = list.findIndex((r) => r.key === (afterKey ?? beforeKey))
        if (anchor === -1) return [...list, row]
        const at = afterKey ? anchor + 1 : anchor
        return [...list.slice(0, at), row, ...list.slice(at)]
      })
      setCollapsed((s) => {
        if (!s.has(category)) return s
        const next = new Set(s)
        next.delete(category)
        return next
      })
      focusCell(row.key, 'description')
    },
    [commit, focusCell],
  )

  const onCommand = useCallback(
    (key: string, command: RowCommand) => {
      const row = rows.find((r) => r.key === key)
      if (!row) return
      switch (command.type) {
        case 'insert-above':
          return addRow(row.category, undefined, key)
        case 'insert-below':
          return addRow(row.category, key)
        case 'duplicate': {
          const copy = { ...row, key: newRowKey(), id: null }
          commit((list) => {
            if (list.length >= MAX_SHEET_ROWS) return list
            const i = list.findIndex((r) => r.key === key)
            return [...list.slice(0, i + 1), copy, ...list.slice(i + 1)]
          })
          return focusCell(copy.key, 'description')
        }
        case 'move-up':
        case 'move-down':
          return commit((list) => {
            const i = list.findIndex((r) => r.key === key)
            const step = command.type === 'move-up' ? -1 : 1
            let j = i + step
            while (j >= 0 && j < list.length && list[j].category !== row.category) j += step
            if (j < 0 || j >= list.length) return list
            const next = [...list]
            ;[next[i], next[j]] = [next[j], next[i]]
            return next
          })
        case 'move-category':
          return commit((list) => [...list.filter((r) => r.key !== key), { ...row, category: command.category }])
        case 'toggle-allowance':
          return onToggleAllowance(key)
        case 'delete': {
          const hasContent = row.id !== null || !isBlankNewRow(row)
          if (hasContent && !window.confirm(`Delete "${row.description || 'this line item'}"? You can undo until you save.`)) return
          return commit((list) => list.filter((r) => r.key !== key))
        }
      }
    },
    [rows, addRow, commit, focusCell, onToggleAllowance],
  )

  const visibleRows = useMemo(
    () => groups.flatMap(([cat, list]) => (collapsed.has(cat) ? [] : list)),
    [groups, collapsed],
  )

  function parseCell(target: EventTarget | null) {
    if (!(target instanceof HTMLInputElement) || !target.dataset.cell) return null
    const [key, col] = target.dataset.cell.split('|') as [string, SheetColumn]
    return { input: target, key, col }
  }

  function onShortcutKeyDown(e: React.KeyboardEvent) {
    if (!(e.metaKey || e.ctrlKey)) return
    const key = e.key.toLowerCase()
    if (key === 'z') {
      e.preventDefault()
      if (e.shiftKey) redo()
      else undo()
    } else if (key === 'y') {
      e.preventDefault()
      redo()
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.metaKey || e.ctrlKey) return
    const cell = parseCell(e.target)
    if (!cell || e.nativeEvent.isComposing || e.keyCode === 229) return
    const rowIdx = visibleRows.findIndex((r) => r.key === cell.key)
    const colIdx = SHEET_COLUMNS.indexOf(cell.col)
    const { selectionStart, selectionEnd, value } = cell.input

    const original = focusValue.current
    if (e.key === 'Escape' && original && original.cell === cell.input.dataset.cell) {
      e.preventDefault()
      onChange(cell.key, cell.col, original.value)
      return
    }
    if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const down = e.key !== 'ArrowUp' && !(e.key === 'Enter' && e.shiftKey)
      const target = visibleRows[rowIdx + (down ? 1 : -1)]
      const current = visibleRows[rowIdx]
      if (target && target.category === current.category) focusCell(target.key, cell.col)
      else if (down && e.key === 'Enter' && !locked) addRow(current.category, current.key)
      else if (target) focusCell(target.key, cell.col)
      return
    }
    if (e.key === 'ArrowLeft' && selectionStart === 0 && selectionEnd === 0 && colIdx > 0) {
      e.preventDefault()
      focusCell(cell.key, SHEET_COLUMNS[colIdx - 1])
    } else if (
      e.key === 'ArrowRight' &&
      selectionStart === value.length &&
      selectionEnd === value.length &&
      colIdx < SHEET_COLUMNS.length - 1
    ) {
      e.preventDefault()
      focusCell(cell.key, SHEET_COLUMNS[colIdx + 1])
    }
  }

  function onFocus(e: React.FocusEvent) {
    const cell = parseCell(e.target)
    if (cell) focusValue.current = { cell: cell.input.dataset.cell!, value: cell.input.value }
  }

  function onPaste(e: React.ClipboardEvent) {
    const cell = parseCell(e.target)
    if (!cell || locked) return
    const text = e.clipboardData.getData('text/plain')
    if (!text.includes('\t') && !text.includes('\n')) return
    e.preventDefault()
    const grid = parseClipboardGrid(text)
    if (!grid.length) return
    const startCol = SHEET_COLUMNS.indexOf(cell.col)
    const startRow = rows.find((r) => r.key === cell.key)
    if (!startRow) return
    commit((list) => {
      const next = [...list]
      const groupKeys = ordered(next).filter((r) => r.category === startRow.category).map((r) => r.key)
      let pos = groupKeys.indexOf(cell.key)
      let lastKey = cell.key
      let added = 0
      for (const values of grid) {
        let key = groupKeys[pos]
        if (!key) {
          if (next.length >= MAX_SHEET_ROWS) break
          const fresh = blankRow(startRow.category)
          const anchor = next.findIndex((r) => r.key === lastKey)
          next.splice(anchor + 1, 0, fresh)
          key = fresh.key
          added += 1
        }
        const i = next.findIndex((r) => r.key === key)
        const patch: Partial<SheetRow> = {}
        values.forEach((v, offset) => {
          const col = SHEET_COLUMNS[startCol + offset]
          if (col) patch[col] = v
        })
        next[i] = { ...next[i], ...patch }
        lastKey = key
        pos += 1
      }
      if (added) toast.success(`Pasted ${grid.length} rows (${added} new).`)
      return next
    })
  }

  function save() {
    if (!editable || locked || !dirty) return
    setSaveError(null)
    if (invalidRows.length) {
      setAttempted(true)
      const first = invalidRows[0]
      const col = SHEET_COLUMNS.find((c) => errorsByKey.get(first.key)?.[c])
      setCollapsed((s) => {
        const next = new Set(s)
        next.delete(first.category)
        return next
      })
      if (col) focusCell(first.key, col)
      return
    }
    const payload = ordered(rows).filter((r) => !isBlankNewRow(r)).map(toPayload)
    startSaving(async () => {
      const result = await saveEstimateLineItemsAction(estimateId, expectedStamp.current, payload)
      if (!result.ok) {
        setSaveError(result.error)
        return
      }
      expectedStamp.current = result.updatedAt
      setAttempted(false)
      setAwaitingSync(true)
      toast.success('Draft saved.')
      router.refresh()
    })
  }

  const onSaveShortcut = useEffectEvent((e: KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 's') return
    e.preventDefault()
    save()
  })

  useEffect(() => {
    if (!editable) return
    const handler = (e: KeyboardEvent) => onSaveShortcut(e)
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [editable])

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    const guardLinks = (e: MouseEvent) => {
      const link = (e.target as HTMLElement | null)?.closest('a[href]')
      if (!link || link.getAttribute('target') === '_blank' || e.defaultPrevented) return
      if (!window.confirm('You have unsaved line item changes. Leave without saving?')) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    window.addEventListener('beforeunload', warn)
    document.addEventListener('click', guardLinks, true)
    return () => {
      window.removeEventListener('beforeunload', warn)
      document.removeEventListener('click', guardLinks, true)
    }
  }, [dirty])

  const toggleGroup = (cat: EstimateCategory) =>
    setCollapsed((s) => {
      const next = new Set(s)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })

  const unusedCategories = ESTIMATE_CATEGORIES.filter((c) => !groups.some(([g]) => g === c))
  const rowCount = rows.filter((r) => !isBlankNewRow(r)).length
  const rowNumbers = new Map(groups.flatMap(([, list]) => list).map((r, i) => [r.key, i + 1]))

  const statusText = saving
    ? 'Saving...'
    : awaitingSync
      ? 'Refreshing...'
      : saveError
        ? 'Not saved'
        : dirty
          ? 'Unsaved changes'
          : 'All changes saved'

  return (
    <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_22rem]">
      <section aria-labelledby="sheet-heading" className="surface flex min-w-0 flex-col" onKeyDown={onShortcutKeyDown}>
        <div className="sticky top-0 z-10 flex flex-col gap-3 rounded-t-2xl border-b bg-card/95 p-4 backdrop-blur md:p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <h2 id="sheet-heading" className="font-serif text-xl font-semibold tracking-tight text-foreground">
                Line items
              </h2>
              <p className="text-sm text-muted-foreground">
                {`${rowCount} ${rowCount === 1 ? 'item' : 'items'} in ${groups.length} ${groups.length === 1 ? 'category' : 'categories'}`}
                {' · '}
                <span className="font-semibold text-foreground tabular-nums">{formatCentsExact(totals.construction_total_cents)}</span>
                {' construction total'}
              </p>
            </div>
            {editable ? (
              <div className="flex flex-wrap items-center gap-2">
                <span
                  role="status"
                  aria-live="polite"
                  className={cn(
                    'text-xs font-medium',
                    saveError ? 'text-destructive' : dirty ? 'text-warning' : 'text-muted-foreground',
                  )}
                >
                  {statusText}
                </span>
                <Button type="button" variant="outline" size="icon" onClick={undo} disabled={!history.past.length || locked} aria-label="Undo">
                  <Undo2 aria-hidden="true" />
                </Button>
                <Button type="button" variant="outline" size="icon" onClick={redo} disabled={!history.future.length || locked} aria-label="Redo">
                  <Redo2 aria-hidden="true" />
                </Button>
                <Button type="button" onClick={save} disabled={!dirty || locked}>
                  <Save data-icon="inline-start" />
                  {saving ? 'Saving...' : 'Save draft'}
                </Button>
              </div>
            ) : (
              <p className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                <Lock className="size-3.5" aria-hidden="true" />
                {`Read-only · ${ESTIMATE_STATUS_LABELS[status]}`}
              </p>
            )}
          </div>

          {saveError && (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {saveError}
            </p>
          )}
          {attempted && invalidRows.length > 0 && (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {`${invalidRows.length} ${invalidRows.length === 1 ? 'row needs' : 'rows need'} attention before saving. Highlighted cells show what to fix.`}
            </p>
          )}
          {editable && (
            <p className="text-xs text-muted-foreground">
              {'Enter moves down (adds a row at the end of a group) · Arrows move between cells · Esc reverts a cell · Paste rows from Excel or Sheets · Ctrl+Z / Ctrl+S'}
            </p>
          )}
        </div>

        <div className="overflow-x-auto" onKeyDown={onKeyDown} onFocus={onFocus} onPaste={onPaste}>
          <table ref={tableRef} className="w-full table-fixed border-collapse text-left">
            <caption className="sr-only">
              {'Estimate line items grouped by category. Line total equals quantity times material, labor, and other unit costs.'}
            </caption>
            <colgroup>
                <col className="w-10" />
                <col className="w-80" />
              <col className="w-24" />
              <col className="w-20" />
              <col className="w-32" />
              <col className="w-32" />
              <col className="w-32" />
              <col className="w-32" />
              <col className="w-36" />
                <col className="w-16" />
                <col className="w-40" />
              {editable && <col className="w-12" />}
            </colgroup>
            <thead className="bg-muted/50 text-xs font-medium text-muted-foreground">
              <tr className="border-b">
                <th scope="col" className="px-2 py-2.5 text-right">
                  <span className="sr-only">Row</span>
                  {'#'}
                </th>
                <th scope="col" className="px-2 py-2.5">Description</th>
                <th scope="col" className="px-2 py-2.5 text-right">Qty</th>
                <th scope="col" className="px-2 py-2.5">Unit</th>
                <th scope="col" className="px-2 py-2.5 text-right">Material / unit</th>
                <th scope="col" className="px-2 py-2.5 text-right">Labor / unit</th>
                <th scope="col" className="px-2 py-2.5 text-right">Other / unit</th>
                <th scope="col" className="px-2 py-2.5 text-right">Unit cost</th>
                <th scope="col" className="px-2 py-2.5 text-right">Line total</th>
                <th scope="col" className="px-2 py-2.5 text-center">
                  <abbr title="Allowance: tracked separately from direct cost and excluded from markup" className="no-underline">
                    Allow.
                  </abbr>
                </th>
                <th scope="col" className="px-2 py-2.5">Notes</th>
                {editable && (
                  <th scope="col" className="px-2 py-2.5">
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            {groups.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={editable ? 12 : 11} className="px-6 py-12 text-center text-sm text-muted-foreground">
                    {editable ? 'No line items yet. Pick a category below to add the first one.' : 'This estimate has no line items.'}
                  </td>
                </tr>
              </tbody>
            ) : (
              groups.map(([cat, list]) => {
                const isCollapsed = collapsed.has(cat)
                const subtotal = list.reduce((sum, r) => sum + rowMath(r).totalCents, 0)
                return (
                  <tbody key={cat}>
                    <tr className="border-b bg-sage/40">
                      <th scope="rowgroup" colSpan={8} className="px-2 py-1.5 text-left">
                        <button
                          type="button"
                          onClick={() => toggleGroup(cat)}
                          aria-expanded={!isCollapsed}
                          className="inline-flex items-center gap-1.5 rounded-md px-1 py-1 text-sm font-semibold text-foreground hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          {isCollapsed ? <ChevronRight className="size-4" aria-hidden="true" /> : <ChevronDown className="size-4" aria-hidden="true" />}
                          {cat}
                          <span className="font-normal text-muted-foreground">{`(${list.length})`}</span>
                        </button>
                      </th>
                      <td className="px-2 py-1.5 text-right text-sm font-semibold tabular-nums text-foreground">
                        {formatCentsExact(subtotal)}
                      </td>
                      <td colSpan={editable ? 3 : 2} className="px-2 py-1.5 text-right">
                        {editable && (
                          <Button type="button" variant="ghost" size="sm" onClick={() => addRow(cat, list[list.length - 1]?.key)} disabled={locked}>
                            <Plus data-icon="inline-start" />
                            Add line
                          </Button>
                        )}
                      </td>
                    </tr>
                    {!isCollapsed &&
                      list.map((row) => {
                        return (
                          <SheetRowView
                            key={row.key}
                            row={row}
                            index={rowNumbers.get(row.key) ?? 0}
                            errors={errorsByKey.get(row.key) ?? {}}
                            showErrors={attempted}
                            editable={editable}
                            locked={locked}
                            onChange={onChange}
                            onToggleAllowance={onToggleAllowance}
                            onCommand={onCommand}
                          />
                        )
                      })}
                  </tbody>
                )
              })
            )}
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4 md:px-5">
          {editable ? (
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Add category</span>
              <NativeSelect
                value=""
                disabled={locked || unusedCategories.length === 0}
                onChange={(e) => e.target.value && addRow(e.target.value as EstimateCategory)}
                className="w-56"
              >
                <option value="">Choose a category</option>
                {unusedCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </NativeSelect>
            </label>
          ) : (
            <span />
          )}
          <p className="text-xs text-muted-foreground">
            {'Line total = Qty × (Material + Labor + Other). Unit cost = Material + Labor + Other.'}
          </p>
        </div>
      </section>

      <div className="2xl:sticky 2xl:top-4 2xl:self-start">
        <EstimateSummary
          totals={totals}
          note={editable ? (dirty ? 'Live preview of unsaved edits. Excludes land.' : 'Excludes land. Matches the saved estimate.') : undefined}
        />
      </div>
    </div>
  )
}
