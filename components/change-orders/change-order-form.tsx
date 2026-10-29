'use client'

import { useActionState, useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus, Trash2 } from 'lucide-react'
import { saveChangeOrderAction } from '@/app/actions/change-orders'
import { initialActionState } from '@/lib/action-state'
import { ESTIMATE_CATEGORIES } from '@/lib/estimates'
import { parseLines, sumLineCosts, type LineInput } from '@/lib/change-orders'
import { formatMoney, parseSignedDollarsToCents } from '@/lib/financials'
import { FormActions, FormSection, NativeSelect, TextAreaField, TextField } from '@/components/shared/form-field'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

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

export function ChangeOrderForm({ projectId, defaults, cancelHref }: { projectId: string; defaults: ChangeOrderFormDefaults; cancelHref: string }) {
  const [state, action] = useActionState(saveChangeOrderAction, initialActionState)
  const [rows, setRows] = useState<Row[]>(() => (defaults.lines.length ? defaults.lines : [blankLine()]).map((l, i) => ({ ...l, key: i })))
  const [nextKey, setNextKey] = useState(rows.length)
  const [price, setPrice] = useState(state.values?.price_adjustment ?? defaults.price_adjustment)
  const v = state.values
  const fe = state.fieldErrors ?? {}

  const preview = useMemo(() => parseLines(rows), [rows])
  const costTotal = sumLineCosts(preview.lines)
  const priceCents = parseSignedDollarsToCents(price || '0')

  const update = (key: number, field: keyof LineInput, value: string) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [field]: value } : r)))
  const addRow = () => {
    setRows((rs) => [...rs, { ...blankLine(), key: nextKey }])
    setNextKey((k) => k + 1)
  }
  const removeRow = (key: number) => setRows((rs) => rs.filter((r) => r.key !== key))

  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="project_id" value={projectId} />
      {defaults.id && <input type="hidden" name="id" value={defaults.id} />}
      <input type="hidden" name="lines_json" value={JSON.stringify(rows.map(({ key: _key, ...l }) => l))} />

      <FormSection title="Change details" description="Describe what changes and why. The homeowner will see the title, description and price change.">
        <TextField name="title" label="Title" required defaultValue={v?.title ?? defaults.title} error={fe.title} className="sm:col-span-2" maxLength={160} />
        <TextAreaField name="description" label="Description" defaultValue={v?.description ?? defaults.description} error={fe.description} className="sm:col-span-2" maxLength={4000} />
        <TextAreaField name="reason" label="Reason for change" defaultValue={v?.reason ?? defaults.reason} error={fe.reason} maxLength={2000} />
        <div className="flex flex-col gap-5">
          <TextField name="requested_by" label="Requested by" defaultValue={v?.requested_by ?? defaults.requested_by} error={fe.requested_by} hint="Homeowner, architect, field condition, etc." maxLength={160} />
          <TextField
            name="schedule_impact_days"
            label="Schedule impact (days)"
            inputMode="numeric"
            defaultValue={v?.schedule_impact_days ?? defaults.schedule_impact_days}
            error={fe.schedule_impact_days}
            hint="Leave blank if unknown. Use a minus sign if the change saves time."
          />
        </div>
      </FormSection>

      <section className="rounded-xl border border-border/80 bg-card p-5 shadow-xs sm:p-6" aria-labelledby="co-cost-heading">
        <header className="mb-4 flex flex-col gap-1 border-b border-border/60 pb-4">
          <h2 id="co-cost-heading" className="text-sm font-semibold text-foreground">
            Builder cost adjustment
          </h2>
          <p className="text-sm text-muted-foreground">Internal cost lines. Use a negative unit cost for credits. Not shown to the homeowner.</p>
        </header>
        <div className="flex flex-col gap-3">
          {rows.map((row, i) => (
            <fieldset key={row.key} className="grid gap-2 rounded-lg border border-border/60 p-3 md:grid-cols-[10rem_1fr_6rem_5rem_8rem_auto] md:items-start">
              <legend className="sr-only">Line {i + 1}</legend>
              <LineCell label="Category" error={fe[`lines.${i}.category`]}>
                <NativeSelect aria-label={`Line ${i + 1} category`} value={row.category} onChange={(e) => update(row.key, 'category', e.target.value)}>
                  {ESTIMATE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </NativeSelect>
              </LineCell>
              <LineCell label="Description" error={fe[`lines.${i}.description`]}>
                <Input aria-label={`Line ${i + 1} description`} className="h-10" maxLength={300} value={row.description} onChange={(e) => update(row.key, 'description', e.target.value)} />
              </LineCell>
              <LineCell label="Qty" error={fe[`lines.${i}.quantity`]}>
                <Input aria-label={`Line ${i + 1} quantity`} className="h-10" inputMode="decimal" value={row.quantity} onChange={(e) => update(row.key, 'quantity', e.target.value)} />
              </LineCell>
              <LineCell label="Unit" error={fe[`lines.${i}.unit`]}>
                <Input aria-label={`Line ${i + 1} unit`} className="h-10" maxLength={20} value={row.unit} onChange={(e) => update(row.key, 'unit', e.target.value)} />
              </LineCell>
              <LineCell label="Unit cost ($)" error={fe[`lines.${i}.unit_cost`]}>
                <Input aria-label={`Line ${i + 1} unit cost`} className="h-10" inputMode="decimal" placeholder="0.00" value={row.unit_cost} onChange={(e) => update(row.key, 'unit_cost', e.target.value)} />
              </LineCell>
              <div className="flex items-end md:pt-6">
                <Button type="button" variant="ghost" size="icon" onClick={() => removeRow(row.key)} aria-label={`Remove line ${i + 1}`}>
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </fieldset>
          ))}
          {fe.lines && <p className="text-xs text-destructive">{fe.lines}</p>}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button type="button" variant="outline" onClick={addRow}>
              <Plus className="size-4" aria-hidden="true" />
              Add line
            </Button>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              Cost adjustment: <span className="font-semibold tabular-nums text-foreground">{formatMoney(costTotal, { signed: true })}</span>
            </p>
          </div>
        </div>
      </section>

      <FormSection title="Customer price adjustment" description="The amount added to (or credited from) the homeowner contract price. Kept separate from builder cost.">
        <TextField
          name="price_adjustment"
          label="Price change ($)"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          error={fe.price_adjustment}
          hint={priceCents === null ? 'Enter a dollar amount like 2500 or -750' : `Homeowner sees ${formatMoney(priceCents, { signed: true })}`}
        />
      </FormSection>

      <FormActions message={<FormMessage state={state} />}>
        <Link href={cancelHref} className={buttonVariants({ variant: 'outline', size: 'lg' })}>
          Cancel
        </Link>
        <SubmitButton pendingLabel="Saving...">{defaults.id ? 'Save changes' : 'Create draft'}</SubmitButton>
      </FormActions>
    </form>
  )
}

function LineCell({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground" aria-hidden="true">
        {label}
      </span>
      {children}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}
