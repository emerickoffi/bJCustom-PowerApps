'use client'

import Link from 'next/link'
import { formatMoney } from '@/lib/financials'
import { sumCents, type CategorySources, type ExcludedRow, type SourceRow } from '@/lib/job-cost-sources'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'

export type SourceMetric = 'budget' | 'committed' | 'actual' | 'remaining' | 'paid'

export const METRIC_LABELS: Record<SourceMetric, string> = {
  budget: 'Current budget',
  committed: 'Committed',
  actual: 'Actual cost',
  remaining: 'Budget remaining',
  paid: 'Paid to vendors',
}

export type SourceSelection = { category: string; code: string; metric: SourceMetric }

const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const formatDate = (value: string | null) => (value ? dateFmt.format(new Date(value.length === 10 ? `${value}T00:00:00Z` : value)) : null)
const statusLabel = (s: string) => s.replace(/_/g, ' ')

export function selectionTotal(metric: SourceMetric, src: CategorySources) {
  const budget = sumCents(src.baseline) + sumCents(src.approvedChanges)
  if (metric === 'budget') return budget
  if (metric === 'committed') return sumCents(src.committed)
  if (metric === 'actual') return sumCents(src.actual)
  if (metric === 'paid') return sumCents(src.paid)
  return budget - sumCents(src.actual)
}

export function BudgetSourcePanel({
  projectName,
  selection,
  sources,
  onClose,
  onSelectMetric,
}: {
  projectName: string
  selection: SourceSelection | null
  sources: CategorySources | undefined
  onClose: () => void
  onSelectMetric: (metric: SourceMetric) => void
}) {
  const open = selection !== null && sources !== undefined
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-lg">
        {open && <PanelBody projectName={projectName} selection={selection} sources={sources} onSelectMetric={onSelectMetric} />}
      </SheetContent>
    </Sheet>
  )
}

function PanelBody({ projectName, selection, sources, onSelectMetric }: { projectName: string; selection: SourceSelection; sources: CategorySources; onSelectMetric: (m: SourceMetric) => void }) {
  const total = selectionTotal(selection.metric, sources)
  return (
    <>
      <SheetHeader className="border-b border-border pr-12">
        <p className="text-xs text-muted-foreground">
          {projectName} · <span className="tabular-nums">{selection.code}</span> {selection.category}
        </p>
        <SheetTitle>{METRIC_LABELS[selection.metric]}</SheetTitle>
        <SheetDescription className="text-2xl font-semibold tabular-nums text-foreground">
          {formatMoney(total, { signed: selection.metric === 'remaining' })}
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-col gap-6 p-4">
        {selection.metric === 'budget' && <BudgetDetail sources={sources} />}
        {selection.metric === 'committed' && (
          <>
            <SourceList title="Counted commitments" rows={sources.committed} total={total} empty="No approved commitments in this category." />
            <ExcludedList rows={sources.excluded.committed} />
            <p className="text-xs text-muted-foreground">Committed is the contractual obligation, not money paid. It can overlap with actual cost as bills arrive.</p>
          </>
        )}
        {selection.metric === 'actual' && (
          <>
            <SourceList title="Approved vendor bills" rows={sources.actual} total={total} empty="No approved vendor bills in this category." />
            <ExcludedList rows={sources.excluded.actual} />
          </>
        )}
        {selection.metric === 'paid' && (
          <>
            <SourceList title="Vendor payments" rows={sources.paid} total={total} empty="No payments recorded on approved bills." />
            <ExcludedList rows={sources.excluded.paid} />
            <p className="text-xs text-muted-foreground">Payments settle approved bills. They never add to actual cost.</p>
          </>
        )}
        {selection.metric === 'remaining' && <RemainingDetail sources={sources} onSelectMetric={onSelectMetric} />}
      </div>
    </>
  )
}

function BudgetDetail({ sources }: { sources: CategorySources }) {
  const original = sumCents(sources.baseline)
  const changes = sumCents(sources.approvedChanges)
  return (
    <>
      <dl className="flex flex-col gap-1 rounded-lg border border-border bg-muted/30 p-3 text-sm">
        <CalcRow label="Original budget" value={original} />
        <CalcRow label="Approved cost changes" value={changes} signed />
        <CalcRow label="Current budget" value={original + changes} strong />
      </dl>
      <SourceList title="Baseline estimate lines" rows={sources.baseline} total={original} empty="No baseline lines in this category." />
      <SourceList title="Approved change-order cost" rows={sources.approvedChanges} total={changes} empty="No approved cost changes." signed />
      {sources.pendingChanges.length > 0 && (
        <SourceList
          title="Pending changes, not included"
          rows={sources.pendingChanges}
          total={sumCents(sources.pendingChanges)}
          empty=""
          signed
          muted
        />
      )}
      <p className="text-xs text-muted-foreground">Change-order cost is used here, never the homeowner selling price. Approval actors are not recorded per line; open the change order for its decision record.</p>
    </>
  )
}

function RemainingDetail({ sources, onSelectMetric }: { sources: CategorySources; onSelectMetric: (m: SourceMetric) => void }) {
  const budget = sumCents(sources.baseline) + sumCents(sources.approvedChanges)
  const actual = sumCents(sources.actual)
  return (
    <>
      <dl className="flex flex-col gap-1 rounded-lg border border-border bg-muted/30 p-3 text-sm">
        <CalcRow label="Current budget" value={budget} />
        <CalcRow label="Less actual cost" value={-actual} signed />
        <CalcRow label="Budget remaining" value={budget - actual} signed strong />
      </dl>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <button type="button" className="font-medium text-primary underline-offset-4 hover:underline" onClick={() => onSelectMetric('budget')}>
          View budget sources
        </button>
        <button type="button" className="font-medium text-primary underline-offset-4 hover:underline" onClick={() => onSelectMetric('actual')}>
          View actual cost sources
        </button>
      </div>
      <p className="text-xs text-muted-foreground">Budget remaining is not cash available or forecast savings. Open commitments may still become cost.</p>
    </>
  )
}

function CalcRow({ label, value, signed, strong }: { label: string; value: number; signed?: boolean; strong?: boolean }) {
  return (
    <div className={strong ? 'flex justify-between border-t border-border pt-1 font-semibold text-foreground' : 'flex justify-between text-muted-foreground'}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{formatMoney(value, { signed })}</dd>
    </div>
  )
}

function SourceList({ title, rows, total, empty, signed, muted }: { title: string; rows: SourceRow[]; total: number; empty: string; signed?: boolean; muted?: boolean }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <span className="text-xs text-muted-foreground">
          {rows.length} record{rows.length === 1 ? '' : 's'}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className={muted ? 'divide-y divide-border rounded-lg border border-dashed border-border' : 'divide-y divide-border rounded-lg border border-border'}>
          {rows.map((r) => (
            <SourceItem key={r.id} row={r} signed={signed} muted={muted} />
          ))}
          <li className="flex justify-between bg-muted/30 px-3 py-2 text-sm font-medium">
            <span>{muted ? 'Pending total' : 'Total'}</span>
            <span className="tabular-nums">{formatMoney(total, { signed })}</span>
          </li>
        </ul>
      )}
    </section>
  )
}

function SourceItem({ row, signed, muted, reason }: { row: SourceRow; signed?: boolean; muted?: boolean; reason?: string }) {
  const meta = [row.vendor, formatDate(row.date), statusLabel(row.status)].filter(Boolean).join(' · ')
  return (
    <li className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="font-medium text-foreground">
          {row.href ? (
            <Link href={row.href} className="text-primary underline-offset-4 hover:underline">
              {row.reference}
            </Link>
          ) : (
            row.reference
          )}
        </span>
        <span className="text-pretty text-muted-foreground">{row.description}</span>
        <span className="text-xs capitalize text-muted-foreground">{meta}</span>
        {(row.note || reason) && <span className="text-xs text-muted-foreground">{reason ?? row.note}</span>}
      </div>
      <span className={muted || reason ? 'shrink-0 tabular-nums text-muted-foreground' : 'shrink-0 tabular-nums font-medium text-foreground'}>
        {reason ? <s>{formatMoney(row.amountCents)}</s> : formatMoney(row.amountCents, { signed: signed && row.amountCents < 0 })}
      </span>
    </li>
  )
}

function ExcludedList({ rows }: { rows: ExcludedRow[] }) {
  if (rows.length === 0) return null
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-foreground">Not counted</h3>
      <ul className="divide-y divide-border rounded-lg border border-dashed border-border">
        {rows.map((r) => (
          <SourceItem key={r.id} row={r} reason={r.reason} />
        ))}
      </ul>
    </section>
  )
}
