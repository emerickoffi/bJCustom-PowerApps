'use client'

import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { Columns3, Info, Search } from 'lucide-react'
import { formatMoney } from '@/lib/financials'
import type { CategoryRow, JobCostSummary } from '@/lib/job-costing'
import type { CategorySources } from '@/lib/job-cost-sources'
import { BUDGET_COLUMNS_COOKIE, OPTIONAL_BUDGET_COLUMNS, serializeBudgetColumns, type OptionalBudgetColumn } from '@/lib/budget-columns'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { BudgetSourcePanel, type SourceMetric, type SourceSelection } from './budget-source-panel'

type Filter = 'all' | 'over' | 'costs' | 'committed'
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All categories' },
  { value: 'over', label: 'Over budget' },
  { value: 'costs', label: 'With actual cost' },
  { value: 'committed', label: 'With commitments' },
]

type Totals = {
  original: number
  revised: number
  committed: number | null
  actual: number | null
  paid: number | null
  forecast: number | null
  variance: number | null
}

const nAdd = (a: number | null, b: number | null) => (a === null || b === null ? null : a + b)

/** Sums category rows with the same nullable rules as summarizeJobCost, so a missing figure never becomes zero. */
function totalsOf(rows: CategoryRow[]): Totals {
  return rows.reduce<Totals>(
    (t, r) => ({
      original: t.original + r.originalCents,
      revised: t.revised + r.revisedCents,
      committed: nAdd(t.committed, r.committedCents),
      actual: nAdd(t.actual, r.actualCents),
      paid: nAdd(t.paid, r.paidCents),
      forecast: nAdd(t.forecast, r.forecastCents),
      variance: nAdd(t.variance, r.varianceCents),
    }),
    { original: 0, revised: 0, committed: 0, actual: 0, paid: 0, forecast: 0, variance: 0 },
  )
}

const HEADER_HELP: Record<string, string> = {
  budget: 'Approved estimate cost (direct, allowances, contingency; markup excluded) plus approved change-order cost. Pending changes are not included.',
  committed: 'Approved subcontracts and purchase orders; closed ones keep only the billed portion. Not money paid, and it can overlap with actual cost.',
  actual: 'Approved vendor bills. Draft and voided bills are not counted; payments never add cost.',
  remaining: 'Current budget minus actual cost. Not cash available, uncommitted funds or forecast savings.',
  original: 'Approved estimate cost before change orders.',
  changes: 'Cost side of approved change orders. Homeowner selling prices are not used.',
  paid: 'Non-reversed payments on approved vendor bills.',
  forecast: 'Per category: manual estimate to complete if recorded, otherwise the greater of current budget or actual plus remaining commitments.',
  variance: 'Current budget minus forecast final cost. Negative means a projected overrun.',
}

export function BudgetCosts({
  projectName,
  summary,
  sources,
  initialColumns,
}: {
  projectName: string
  summary: JobCostSummary
  sources: Record<string, CategorySources>
  initialColumns: OptionalBudgetColumn[]
}) {
  const tracking = summary.costTrackingAvailable
  const budgetSet = summary.budgetEstablished
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [shown, setShown] = useState<readonly OptionalBudgetColumn[]>(initialColumns)
  const [selection, setSelection] = useState<SourceSelection | null>(null)

  const available = OPTIONAL_BUDGET_COLUMNS.filter((c) => tracking || !c.tracking)
  const visible = (key: OptionalBudgetColumn) => shown.includes(key) && available.some((c) => c.key === key)

  const saveColumns = (next: readonly OptionalBudgetColumn[] | null) => {
    if (next === null) {
      setShown([])
      document.cookie = `${BUDGET_COLUMNS_COOKIE}=; path=/; max-age=0; samesite=lax`
      return
    }
    setShown(next)
    document.cookie = `${BUDGET_COLUMNS_COOKIE}=${serializeBudgetColumns(next)}; path=/; max-age=31536000; samesite=lax`
  }

  const remainingOf = (revised: number, actual: number | null) => (budgetSet && actual !== null ? revised - actual : null)

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    return summary.groups
      .map((g) => ({
        ...g,
        categories: g.categories.filter((c) => {
          if (q && !`${c.category} ${g.label} ${g.code}`.toLowerCase().includes(q)) return false
          if (filter === 'over') return budgetSet && c.actualCents !== null && c.actualCents > c.revisedCents
          if (filter === 'costs') return (c.actualCents ?? 0) !== 0
          if (filter === 'committed') return (c.committedCents ?? 0) !== 0
          return true
        }),
      }))
      .filter((g) => g.categories.length > 0)
  }, [summary.groups, query, filter, budgetSet])

  const filtered = query.trim() !== '' || filter !== 'all'
  const total = totalsOf(groups.flatMap((g) => g.categories))

  const has = (category: string, metric: SourceMetric) => {
    const s = sources[category]
    if (!s) return false
    if (metric === 'budget') return budgetSet && s.baseline.length + s.approvedChanges.length + s.pendingChanges.length > 0
    if (metric === 'committed') return tracking && s.committed.length > 0
    if (metric === 'actual') return tracking && s.actual.length > 0
    if (metric === 'paid') return tracking && s.paid.length > 0
    return budgetSet && tracking && s.baseline.length + s.approvedChanges.length + s.actual.length > 0
  }

  const cell = (row: CategoryRow, code: string, metric: SourceMetric, content: ReactNode) => {
    if (!has(row.category, metric)) return content
    const active = selection?.category === row.category && selection.metric === metric
    return (
      <button
        type="button"
        onClick={() => setSelection({ category: row.category, code, metric })}
        aria-pressed={active}
        className={cn(
          '-mx-1.5 rounded px-1.5 py-0.5 font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring',
          active && 'bg-primary/10 underline',
        )}
      >
        {content}
      </button>
    )
  }

  const numCols = 4 + (visible('original') ? 1 : 0) + (visible('changes') ? 1 : 0) + (visible('paid') ? 1 : 0) + (visible('forecast') ? 1 : 0) + (visible('variance') ? 1 : 0)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search cost categories"
            aria-label="Search cost categories"
            className="bg-card pl-9"
          />
        </div>
        <div className="flex gap-2 sm:ml-auto">
          <Select value={filter} onValueChange={(v) => setFilter((v as Filter) ?? 'all')} items={FILTERS}>
            <SelectTrigger aria-label="Filter categories" className="min-w-44 bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value} disabled={f.value === 'over' && !budgetSet}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" className="bg-card" />}>
              <Columns3 data-icon="inline-start" />
              Columns
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Detail columns</DropdownMenuLabel>
                {available.map((c) => (
                  <DropdownMenuCheckboxItem
                    key={c.key}
                    checked={shown.includes(c.key)}
                    onCheckedChange={(on) => saveColumns(on ? [...shown.filter((k) => k !== c.key), c.key] : shown.filter((k) => k !== c.key))}
                  >
                    {c.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => saveColumns(null)}>Reset columns</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="max-h-[70vh] overflow-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
          <caption className="sr-only">Budget and costs by cost category</caption>
          <thead className="text-xs font-medium text-[#526173]">
            <tr>
              <th scope="col" className="sticky top-0 left-0 z-20 border-b border-[#D6DDE5] bg-table-head px-3 py-2 text-left font-medium">
                Cost category
              </th>
              {visible('original') && <Head label="Original budget" help={HEADER_HELP.original} />}
              {visible('changes') && <Head label="Approved changes" help={HEADER_HELP.changes} />}
              <Head label="Current budget" help={HEADER_HELP.budget} />
              <Head label="Committed" help={HEADER_HELP.committed} />
              <Head label="Actual cost" help={HEADER_HELP.actual} />
              <Head label="Budget remaining" help={HEADER_HELP.remaining} />
              {visible('paid') && <Head label="Paid to vendors" help={HEADER_HELP.paid} />}
              {visible('forecast') && <Head label="Forecast final cost" help={HEADER_HELP.forecast} />}
              {visible('variance') && <Head label="Forecast variance" help={HEADER_HELP.variance} />}
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr>
                <td colSpan={numCols + 1} className="px-3 py-8 text-center text-muted-foreground">
                  {filtered ? 'No cost categories match.' : 'No budget lines or recorded costs yet.'}
                </td>
              </tr>
            ) : (
              groups.map((g) => {
                const sub = totalsOf(g.categories)
                const single = g.categories.length === 1
                return (
                  <Fragment key={g.code}>
                    {!single && (
                      <tr className="bg-muted/30">
                        <th scope="rowgroup" colSpan={1} className="sticky left-0 z-10 border-b border-border bg-[inherit] px-3 py-2 text-left font-medium text-foreground">
                          <span className="flex items-baseline gap-2 bg-transparent">
                            {g.label}
                            <span className="text-xs font-normal tabular-nums text-muted-foreground">{g.code}</span>
                          </span>
                        </th>
                        <AmountCells t={sub} visible={visible} budgetSet={budgetSet} tracking={tracking} remaining={remainingOf(sub.revised, sub.actual)} muted />
                      </tr>
                    )}
                    {g.categories.map((c) => {
                      const rowActive = selection?.category === c.category
                      const remaining = remainingOf(c.revisedCents, c.actualCents)
                      return (
                        <tr key={c.category} className={cn('group/row', rowActive && 'bg-primary/5')}>
                          <th
                            scope="row"
                            className={cn(
                              'sticky left-0 z-10 border-b border-border/70 px-3 py-2 text-left font-normal',
                              rowActive ? 'bg-[color-mix(in_oklab,var(--primary)_5%,var(--card))]' : 'bg-card',
                              !single && 'pl-7',
                            )}
                          >
                            <span className="flex flex-col">
                              <span className="font-medium text-foreground">{c.category}</span>
                              {single && <span className="text-xs tabular-nums text-muted-foreground">{g.code} · {g.label}</span>}
                              {c.manualEtc && <span className="text-xs text-muted-foreground">Manual estimate to complete</span>}
                            </span>
                          </th>
                          {visible('original') && <Num>{budgetSet ? cell(c, g.code, 'budget', formatMoney(c.originalCents)) : <Missing kind="budget" />}</Num>}
                          {visible('changes') && <Num>{budgetSet ? cell(c, g.code, 'budget', formatMoney(c.revisedCents - c.originalCents, { signed: true })) : <Missing kind="budget" />}</Num>}
                          <Num>{budgetSet ? cell(c, g.code, 'budget', formatMoney(c.revisedCents)) : <Missing kind="budget" />}</Num>
                          <Num>{c.committedCents === null ? <Missing kind="tracking" /> : cell(c, g.code, 'committed', formatMoney(c.committedCents))}</Num>
                          <Num>{c.actualCents === null ? <Missing kind="tracking" /> : cell(c, g.code, 'actual', formatMoney(c.actualCents))}</Num>
                          <Num>{remaining === null ? <Missing kind={budgetSet ? 'tracking' : 'budget'} /> : cell(c, g.code, 'remaining', <Remaining value={remaining} />)}</Num>
                          {visible('paid') && <Num>{c.paidCents === null ? <Missing kind="tracking" /> : cell(c, g.code, 'paid', formatMoney(c.paidCents))}</Num>}
                          {visible('forecast') && <Num>{c.forecastCents === null ? <Missing kind="tracking" /> : formatMoney(c.forecastCents)}</Num>}
                          {visible('variance') && <Num>{c.varianceCents === null ? <Missing kind={budgetSet ? 'tracking' : 'budget'} /> : <Remaining value={c.varianceCents} />}</Num>}
                        </tr>
                      )
                    })}
                  </Fragment>
                )
              })
            )}
          </tbody>
          {groups.length > 0 && (
            <tfoot>
              <tr className="font-semibold text-foreground">
                <th scope="row" className="sticky bottom-0 left-0 z-20 border-t-2 border-[#D6DDE5] bg-table-head px-3 py-2.5 text-left">
                  {filtered ? 'Filtered total' : 'Project total'}
                </th>
                <AmountCells t={total} visible={visible} budgetSet={budgetSet} tracking={tracking} remaining={remainingOf(total.revised, total.actual)} footer />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <BudgetSourcePanel
        projectName={projectName}
        selection={selection}
        sources={selection ? sources[selection.category] : undefined}
        onClose={() => setSelection(null)}
        onSelectMetric={(metric) => setSelection((s) => (s ? { ...s, metric } : s))}
      />
    </div>
  )
}

function Head({ label, help }: { label: string; help: string }) {
  return (
    <th scope="col" className="sticky top-0 z-10 border-b border-[#D6DDE5] bg-table-head px-3 py-2 text-right font-medium whitespace-nowrap">
      <span className="inline-flex items-center gap-1">
        {label}
        <Tooltip>
          <TooltipTrigger
            render={<button type="button" className="rounded text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring" aria-label={`About ${label}`} />}
          >
            <Info className="size-3.5" aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent className="max-w-64 text-left font-normal">{help}</TooltipContent>
        </Tooltip>
      </span>
    </th>
  )
}

function Num({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn('border-b border-border/70 px-3 py-2 text-right whitespace-nowrap tabular-nums text-foreground', className)}>{children}</td>
}

function Missing({ kind }: { kind: 'budget' | 'tracking' }) {
  return <span className="text-xs font-normal text-muted-foreground">{kind === 'budget' ? 'Not established' : 'Unavailable'}</span>
}

function Remaining({ value }: { value: number }) {
  if (value >= 0) return <>{formatMoney(value)}</>
  return (
    <span className="text-destructive">
      {formatMoney(value, { signed: true })}
      <span className="sr-only"> (over budget)</span>
    </span>
  )
}

function AmountCells({
  t,
  visible,
  budgetSet,
  tracking,
  remaining,
  muted,
  footer,
}: {
  t: Totals
  visible: (k: OptionalBudgetColumn) => boolean
  budgetSet: boolean
  tracking: boolean
  remaining: number | null
  muted?: boolean
  footer?: boolean
}) {
  const cls = cn(muted && 'font-medium', footer && 'sticky bottom-0 border-t-2 border-b-0 border-[#D6DDE5] bg-table-head py-2.5')
  const budgetVal = (v: number, signed = false) => (budgetSet ? formatMoney(v, { signed }) : <Missing kind="budget" />)
  const trackVal = (v: number | null) => (tracking && v !== null ? formatMoney(v) : <Missing kind="tracking" />)
  return (
    <>
      {visible('original') && <Num className={cls}>{budgetVal(t.original)}</Num>}
      {visible('changes') && <Num className={cls}>{budgetVal(t.revised - t.original, true)}</Num>}
      <Num className={cls}>{budgetVal(t.revised)}</Num>
      <Num className={cls}>{trackVal(t.committed)}</Num>
      <Num className={cls}>{trackVal(t.actual)}</Num>
      <Num className={cls}>{remaining === null ? <Missing kind={budgetSet ? 'tracking' : 'budget'} /> : <Remaining value={remaining} />}</Num>
      {visible('paid') && <Num className={cls}>{trackVal(t.paid)}</Num>}
      {visible('forecast') && <Num className={cls}>{budgetSet ? trackVal(t.forecast) : <Missing kind="budget" />}</Num>}
      {visible('variance') && <Num className={cls}>{!budgetSet ? <Missing kind="budget" /> : t.variance === null || !tracking ? <Missing kind="tracking" /> : <Remaining value={t.variance} />}</Num>}
    </>
  )
}
