'use client'

import { useActionState, useMemo, useState } from 'react'
import Link from 'next/link'
import { Copy, Plus, Trash2 } from 'lucide-react'
import { saveChangeOrderAction } from '@/app/actions/change-orders'
import { initialActionState } from '@/lib/action-state'
import { ESTIMATE_CATEGORIES } from '@/lib/estimates'
import { parseLines, sumLineCosts, type LineInput } from '@/lib/change-orders'
import { formatMoney, parseSignedDollarsToCents } from '@/lib/financials'
import { FormActions, NativeSelect, TextAreaField, TextField } from '@/components/shared/form-field'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { ChangeOrderStatus } from '@/lib/change-orders'
import { ChangeOrderSection } from '@/components/change-orders/change-order-section'
import { ChangeOrderStatusBadge } from '@/components/change-orders/change-order-status-badge'

export type ChangeOrderFormDefaults = {
  id?: string
  title: string
  description: string
  reason: string
  requested_by: string
  schedule_impact_days: string
  price_adjustment: string
  lines: LineInput[]
}

const blankLine = (): LineInput => ({ category: 'Other', description: '', quantity: '1', unit: 'ea', unit_cost: '' })

type Row = LineInput & { key: number }

const isBlankRow = (r: LineInput) => !r.description.trim() && !r.unit_cost.trim()

function rowCost(row: LineInput): number | null {
  if (isBlankRow(row)) return null
  const { lines, errors } = parseLines([row])
  return Object.keys(errors).length || !lines[0] ? null : lines[0].cost_cents
}

export function ChangeOrderForm({
  projectId,
  defaults,
  cancelHref,
  status,
}: {
  projectId: string
  defaults: ChangeOrderFormDefaults
  cancelHref: string
  status?: ChangeOrderStatus
}) {
  const [state, action] = useActionState(saveChangeOrderAction, initialActionState)
  const [rows, setRows] = useState<Row[]>(() => (defaults.lines.length ? defaults.lines : [blankLine()]).map((l, i) => ({ ...l, key: i })))
  const [nextKey, setNextKey] = useState(rows.length)
  const [focusKey, setFocusKey] = useState<number | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null)
  const [price, setPrice] = useState(state.values?.price_adjustment ?? defaults.price_adjustment)
  const [schedule, setSchedule] = useState(state.values?.schedule_impact_days ?? defaults.schedule_impact_days)
  const v = state.values
  const fe = state.fieldErrors ?? {}

  const preview = useMemo(() => parseLines(rows), [rows])
  const costTotal = sumLineCosts(preview.lines)
  const priceCents = parseSignedDollarsToCents(price || '0')
  const lineCount = preview.lines.length

  const update = (key: number, field: keyof LineInput, value: string) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [field]: value } : r)))
  const insertAfter = (afterKey: number | null, line: LineInput) => {
    const key = nextKey
    setRows((rs) => {
      const idx = afterKey === null ? rs.length - 1 : rs.findIndex((r) => r.key === afterKey)
      const next = [...rs]
      next.splice(idx + 1, 0, { ...line, key })
      return next
    })
    setNextKey(key + 1)
    setFocusKey(key)
  }
  const removeRow = (key: number) => {
    setRows((rs) => {
      const next = rs.filter((r) => r.key !== key)
      return next.length ? next : [{ ...blankLine(), key: nextKey }]
    })
    if (rows.length === 1) setNextKey((k) => k + 1)
    setConfirmRemove(null)
  }
  const requestRemove = (row: Row) => (isBlankRow(row) ? removeRow(row.key) : setConfirmRemove(row.key))

  const onLastFieldKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, row: Row, isLast: boolean) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing || e.keyCode === 229) return
    e.preventDefault()
    if (isLast) return insertAfter(row.key, blankLine())
    const idx = rows.findIndex((r) => r.key === row.key)
    document.getElementById(`co-line-${rows[idx + 1]?.key}-description`)?.focus()
  }

  const summary = (
    <ChangeOrderSummary priceCents={priceCents} costCents={costTotal} lineCount={lineCount} schedule={schedule} />
  )

  return (
    <form action={action} className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <input type="hidden" name="project_id" value={projectId} />
      {defaults.id && <input type="hidden" name="id" value={defaults.id} />}
      <input type="hidden" name="lines_json" value={JSON.stringify(rows.map(({ key: _key, ...l }) => l))} />

      <div className="flex min-w-0 flex-col gap-6">
        <ChangeOrderSection
          id="co-homeowner-heading"
          audience="homeowner"
          title="Homeowner summary"
          description="These four fields are what the homeowner reviews and approves."
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField name="title" label="Title" required defaultValue={v?.title ?? defaults.title} error={fe.title} className="sm:col-span-2" maxLength={160} />
            <TextAreaField name="description" label="Description" defaultValue={v?.description ?? defaults.description} error={fe.description} className="sm:col-span-2" maxLength={4000} />
            <TextField
              name="price_adjustment"
              label="Homeowner price change ($)"
              inputMode="decimal"
              placeholder="0.00"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              error={fe.price_adjustment}
              hint={priceCents === null ? 'Enter a dollar amount like 2500 or -750' : 'Set separately from builder cost. Use a minus sign for credits.'}
            />
            <TextField
              name="schedule_impact_days"
              label="Schedule impact (days)"
              inputMode="numeric"
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              error={fe.schedule_impact_days}
              hint="Leave blank if unknown. Negative if it saves time."
            />
          </div>
        </ChangeOrderSection>

        <ChangeOrderSection
          id="co-cost-heading"
          audience="internal"
          title="Builder cost and context"
          description="Never shown to the homeowner. Negative unit cost for credits. Enter in a unit cost moves to the next line, or adds one."
          flush
        >
          <div className="grid gap-5 border-b border-border/70 px-5 py-5 sm:grid-cols-2 md:px-6">
            <TextAreaField name="reason" label="Reason for change" defaultValue={v?.reason ?? defaults.reason} error={fe.reason} maxLength={2000} rows={2} />
            <TextField name="requested_by" label="Requested by" defaultValue={v?.requested_by ?? defaults.requested_by} error={fe.requested_by} hint="Homeowner, architect, field condition, etc." maxLength={160} />
          </div>

          <div
            aria-hidden="true"
            className="hidden border-b border-border/70 bg-muted/40 px-6 py-2 text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground md:grid md:grid-cols-[9rem_minmax(0,1fr)_4.5rem_4rem_7rem_7rem_4.5rem] md:gap-2"
          >
            <span>Category</span>
            <span>Description</span>
            <span className="text-right">Qty</span>
            <span>Unit</span>
            <span className="text-right">Unit cost</span>
            <span className="text-right">Line total</span>
            <span className="sr-only">Actions</span>
          </div>
          <div className="flex flex-col gap-3 p-4 md:gap-0 md:divide-y md:divide-border/50 md:p-0">
            {rows.map((row, i) => {
              const cost = rowCost(row)
              const isLast = i === rows.length - 1
              return (
                <fieldset
                  key={row.key}
                  className="grid grid-cols-2 gap-2 rounded-lg border border-border/60 p-3 md:grid-cols-[9rem_minmax(0,1fr)_4.5rem_4rem_7rem_7rem_4.5rem] md:items-start md:rounded-none md:border-0 md:px-6 md:py-2 md:hover:bg-muted/20"
                >
                  <legend className="sr-only">Line {i + 1}</legend>
                  <LineCell label="Category" error={fe[`lines.${i}.category`]} className="col-span-2 md:col-span-1">
                    <NativeSelect aria-label={`Line ${i + 1} category`} className="h-9" value={row.category} onChange={(e) => update(row.key, 'category', e.target.value)}>
                      {ESTIMATE_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </NativeSelect>
                  </LineCell>
                  <LineCell label="Description" error={fe[`lines.${i}.description`]} className="col-span-2 md:col-span-1">
                    <Input
                      id={`co-line-${row.key}-description`}
                      aria-label={`Line ${i + 1} description`}
                      className="h-9"
                      maxLength={300}
                      value={row.description}
                      autoFocus={focusKey === row.key}
                      onChange={(e) => update(row.key, 'description', e.target.value)}
                    />
                  </LineCell>
                  <LineCell label="Qty" error={fe[`lines.${i}.quantity`]}>
                    <Input aria-label={`Line ${i + 1} quantity`} className="h-9 text-right tabular-nums" inputMode="decimal" value={row.quantity} onChange={(e) => update(row.key, 'quantity', e.target.value)} />
                  </LineCell>
                  <LineCell label="Unit" error={fe[`lines.${i}.unit`]}>
                    <Input aria-label={`Line ${i + 1} unit`} className="h-9" maxLength={20} value={row.unit} onChange={(e) => update(row.key, 'unit', e.target.value)} />
                  </LineCell>
                  <LineCell label="Unit cost ($)" error={fe[`lines.${i}.unit_cost`]}>
                    <Input
                      aria-label={`Line ${i + 1} unit cost`}
                      className="h-9 text-right tabular-nums"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={row.unit_cost}
                      onChange={(e) => update(row.key, 'unit_cost', e.target.value)}
                      onKeyDown={(e) => onLastFieldKeyDown(e, row, isLast)}
                    />
                  </LineCell>
                  <LineCell label="Line total">
                    <output aria-label={`Line ${i + 1} cost`} className="flex h-9 items-center justify-end text-sm font-medium tabular-nums text-foreground">
                      {cost === null ? '—' : formatMoney(cost, { signed: true })}
                    </output>
                  </LineCell>
                  <div className="col-span-2 flex items-center justify-end gap-0.5 md:col-span-1">
                    {confirmRemove === row.key ? (
                      <div className="flex items-center gap-1" role="group" aria-label={`Confirm removing line ${i + 1}`}>
                        <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-destructive" onClick={() => removeRow(row.key)}>
                          Remove
                        </Button>
                        <Button type="button" variant="ghost" size="sm" className="h-8 px-2" onClick={() => setConfirmRemove(null)}>
                          Keep
                        </Button>
                      </div>
                    ) : (
                      <>
                        <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => insertAfter(row.key, { ...row })} aria-label={`Duplicate line ${i + 1}`} title="Duplicate line">
                          <Copy className="size-4" aria-hidden="true" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => requestRemove(row)} aria-label={`Remove line ${i + 1}`} title="Remove line">
                          <Trash2 className="size-4" aria-hidden="true" />
                        </Button>
                      </>
                    )}
                  </div>
                </fieldset>
              )
            })}
          </div>
          {fe.lines && <p className="px-5 pt-3 text-xs text-destructive md:px-6">{fe.lines}</p>}
          <div className="flex flex-col gap-3 border-t border-border/70 bg-muted/30 px-5 py-3 sm:flex-row sm:items-center sm:justify-between md:px-6">
            <Button type="button" variant="outline" size="sm" onClick={() => insertAfter(null, blankLine())}>
              <Plus className="size-4" aria-hidden="true" />
              Add line
            </Button>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              Builder cost subtotal: <span className="font-semibold tabular-nums text-foreground">{formatMoney(costTotal, { signed: true })}</span>
            </p>
          </div>
        </ChangeOrderSection>

        <details className="rounded-xl border border-border/80 bg-card p-4 shadow-xs lg:hidden">
          <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-medium text-foreground">
            <span>Summary</span>
            <span className="tabular-nums">{priceCents === null ? '—' : formatMoney(priceCents, { signed: true })}</span>
          </summary>
          <div className="mt-3">{summary}</div>
        </details>

        <FormActions message={<FormMessage state={state} />}>
          <Link href={cancelHref} className={buttonVariants({ variant: 'outline', size: 'lg' })}>
            Cancel
          </Link>
          <SubmitButton pendingLabel="Saving...">{defaults.id ? 'Save changes' : 'Save draft'}</SubmitButton>
        </FormActions>
      </div>

      <aside className="hidden rounded-xl border border-border/80 bg-card p-5 shadow-xs lg:sticky lg:top-20 lg:block" aria-label="Change order summary">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">Summary</h2>
          {status && <ChangeOrderStatusBadge status={status} />}
        </div>
        {summary}
      </aside>
    </form>
  )
}

function ChangeOrderSummary({ priceCents, costCents, lineCount, schedule }: { priceCents: number | null; costCents: number; lineCount: number; schedule: string }) {
  const margin = priceCents === null ? null : priceCents - costCents
  const days = schedule.trim() === '' ? null : Number(schedule)
  return (
    <dl className="flex flex-col gap-3 text-sm">
      <SummaryRow label="Homeowner price change" value={priceCents === null ? '—' : formatMoney(priceCents, { signed: true })} strong />
      <SummaryRow label="Schedule impact" value={days === null || !Number.isInteger(days) ? 'Not set' : `${days > 0 ? '+' : ''}${days} ${Math.abs(days) === 1 ? 'day' : 'days'}`} />
      <div className="border-t border-border/60 pt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Internal only</div>
      <SummaryRow label={`Builder cost (${lineCount} line${lineCount === 1 ? '' : 's'})`} value={formatMoney(costCents, { signed: true })} />
      <SummaryRow label="Margin on change" value={margin === null ? '—' : formatMoney(margin, { signed: true })} tone={margin !== null && margin < 0 ? 'danger' : undefined} />
      <p className="text-xs text-muted-foreground">Preview only. Totals are recalculated on the server when you save.</p>
    </dl>
  )
}

function SummaryRow({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: 'danger' }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('tabular-nums', strong ? 'text-base font-semibold text-primary' : 'font-medium text-foreground', tone === 'danger' && 'text-destructive')}>{value}</dd>
    </div>
  )
}

function LineCell({ label, error, className, children }: { label: string; error?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <span className="text-xs font-medium text-muted-foreground md:sr-only" aria-hidden="true">
        {label}
      </span>
      {children}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}
