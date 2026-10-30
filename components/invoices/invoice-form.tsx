'use client'

import { useActionState, useMemo, useState } from 'react'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TextField, TextAreaField, NativeSelect, FormSection } from '@/components/shared/form-field'
import { saveInvoiceDraft } from '@/app/actions/invoices'
import { initialActionState } from '@/lib/action-state'
import { SmartFormLayout, useSmartForm } from '@/components/shared/smart-form'
import { formatCentsExact } from '@/lib/estimates'
import {
  DRAW_MILESTONES,
  DRAW_MILESTONE_LABELS,
  computeInvoiceTotals,
  type InvoiceLineInput,
} from '@/lib/invoices'

type ProjectOption = { id: string; name: string; project_number: string | null; has_client: boolean }
type EstimateOption = {
  id: string
  project_id: string
  name: string
  estimate_number: string | null
  construction_total_cents: number
  billed_cents: number
}

export type InvoiceFormDefaults = {
  id?: string
  project_id?: string
  estimate_id?: string | null
  invoice_type?: 'standard' | 'draw'
  draw_milestone?: string | null
  title?: string
  invoice_date?: string
  due_date?: string
  tax_percent?: string
  payment_terms?: string | null
  payment_instructions?: string | null
  notes?: string | null
  lines?: InvoiceLineInput[]
}

const LINE_GRID = 'lg:grid-cols-[minmax(16rem,1fr)_6rem_9rem_5rem_2.5rem]'

const emptyLine = (): InvoiceLineInput => ({ description: '', quantity: '1', unitRate: '', taxable: true })

export function InvoiceForm({
  projects,
  estimates,
  defaults,
  cancelHref,
}: {
  projects: ProjectOption[]
  estimates: EstimateOption[]
  defaults: InvoiceFormDefaults
  cancelHref: string
}) {
  const [state, formAction, pending] = useActionState(saveInvoiceDraft, initialActionState)
  const v = state.values
  const fe = state.fieldErrors ?? {}

  const [projectId, setProjectId] = useState(v?.project_id ?? defaults.project_id ?? '')
  const [estimateId, setEstimateId] = useState(v?.estimate_id ?? defaults.estimate_id ?? '')
  const [type, setType] = useState<'standard' | 'draw'>(
    (v?.invoice_type as 'standard' | 'draw') ?? defaults.invoice_type ?? 'standard',
  )
  const [taxPercent, setTaxPercent] = useState(v?.tax_percent ?? defaults.tax_percent ?? '0')
  const [lines, setLines] = useState<InvoiceLineInput[]>(() => {
    if (v?.lines) {
      try {
        return JSON.parse(v.lines) as InvoiceLineInput[]
      } catch {}
    }
    return defaults.lines?.length ? defaults.lines : [emptyLine()]
  })

  const totals = useMemo(() => computeInvoiceTotals(lines, taxPercent), [lines, taxPercent])
  const projectEstimates = estimates.filter((e) => e.project_id === projectId)
  const estimate = projectEstimates.find((e) => e.id === estimateId)
  const remaining = estimate ? estimate.construction_total_cents - estimate.billed_cents : null
  const selectedProject = projects.find((p) => p.id === projectId)

  const updateLine = (index: number, patch: Partial<InvoiceLineInput>) =>
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)))

  const today = new Date().toISOString().slice(0, 10)
  const due = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
  const formKey = v ? JSON.stringify(v) : 'initial'
  const { inOverlay: flat, dirty, formProps } = useSmartForm(state, formKey)

  return (
    <form key={formKey} action={formAction} {...formProps}>
      <SmartFormLayout
        dirty={dirty}
        cancelHref={cancelHref}
        submit={
          <Button type="submit" size="lg" disabled={pending} aria-busy={pending || undefined}>
            {pending && <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden="true" />}
            {pending ? 'Saving…' : 'Save draft'}
          </Button>
        }
      >
      {defaults.id && <input type="hidden" name="id" value={defaults.id} />}
      {!defaults.id && <input type="hidden" name="id" value="" />}
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />

      {state.error && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {state.error}
        </div>
      )}

      <FormSection flat={flat} title="Project & billing source" description="The homeowner is taken from the project's primary client when the invoice is issued.">
        <div className="grid gap-5 sm:col-span-2 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="project_id" className="text-sm font-medium">
              Project<span className="text-destructive" aria-hidden="true">*</span>
            </label>
            <NativeSelect
              id="project_id"
              name="project_id"
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value)
                setEstimateId('')
              }}
              aria-invalid={fe.project_id ? true : undefined}
              required
            >
              <option value="" disabled>
                Choose a project
              </option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.project_number ? ` (${p.project_number})` : ''}
                  {p.has_client ? '' : ' — no primary client'}
                </option>
              ))}
            </NativeSelect>
            {fe.project_id && <p className="text-xs text-destructive">{fe.project_id}</p>}
            {selectedProject && !selectedProject.has_client && (
              <p className="text-xs text-warning">Add a primary client to this project before saving.</p>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="estimate_id" className="text-sm font-medium">
              Bill against approved estimate
            </label>
            <NativeSelect
              id="estimate_id"
              name="estimate_id"
              value={estimateId}
              onChange={(e) => setEstimateId(e.target.value)}
              disabled={!projectId}
            >
              <option value="">Not linked to an estimate</option>
              {projectEstimates.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.estimate_number ?? e.name} · {formatCentsExact(e.construction_total_cents)}
                </option>
              ))}
            </NativeSelect>
            <p className="text-xs text-muted-foreground">
              {estimate && remaining !== null
                ? `${formatCentsExact(estimate.billed_cents)} already billed · ${formatCentsExact(remaining)} remaining. Issuing more than the remaining amount is blocked.`
                : projectId && projectEstimates.length === 0
                  ? 'This project has no approved estimate.'
                  : 'Optional. Keeps cumulative billing within the approved amount.'}
            </p>
          </div>

          <TextField
            name="title"
            label="Title"
            required
            defaultValue={v?.title ?? defaults.title ?? ''}
            error={fe.title}
            placeholder="Framing draw"
            className="sm:col-span-2"
          />

          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="invoice_type" className="text-sm font-medium">
              Invoice type
            </label>
            <NativeSelect
              id="invoice_type"
              name="invoice_type"
              value={type}
              onChange={(e) => setType(e.target.value as 'standard' | 'draw')}
            >
              <option value="standard">Standard invoice</option>
              <option value="draw">Progress draw</option>
            </NativeSelect>
          </div>

          <TextField
            name="invoice_date"
            label="Invoice date"
            type="date"
            required
            defaultValue={v?.invoice_date ?? defaults.invoice_date ?? today}
            error={fe.invoice_date}
          />
          <TextField
            name="due_date"
            label="Due date"
            type="date"
            required
            defaultValue={v?.due_date ?? defaults.due_date ?? due}
            error={fe.due_date}
          />

          {type === 'draw' ? (
            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor="draw_milestone" className="text-sm font-medium">
                Draw milestone<span className="text-destructive" aria-hidden="true">*</span>
              </label>
              <NativeSelect
                id="draw_milestone"
                name="draw_milestone"
                defaultValue={v?.draw_milestone ?? defaults.draw_milestone ?? ''}
                aria-invalid={fe.draw_milestone ? true : undefined}
              >
                <option value="" disabled>
                  Choose a milestone
                </option>
                {DRAW_MILESTONES.map((m) => (
                  <option key={m} value={m}>
                    {DRAW_MILESTONE_LABELS[m]}
                  </option>
                ))}
              </NativeSelect>
              {fe.draw_milestone && <p className="text-xs text-destructive">{fe.draw_milestone}</p>}
            </div>
          ) : (
            <input type="hidden" name="draw_milestone" value="" />
          )}
        </div>
      </FormSection>

      <FormSection flat={flat} title="Line items" description="Amounts are calculated in whole cents and match the saved invoice exactly.">
        <div className="flex min-w-0 flex-col gap-3 sm:col-span-2">
          <div
            aria-hidden="true"
            className={`hidden gap-3 border-b border-border/60 px-1 pb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground lg:grid ${LINE_GRID}`}
          >
            <span>Description</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Rate ($)</span>
            <span className="text-center">Taxable</span>
            <span />
          </div>
          {lines.map((line, i) => (
            <fieldset
              key={i}
              className={`grid min-w-0 grid-cols-2 gap-3 rounded-lg border border-border/80 bg-background p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-center lg:rounded-none lg:border-0 lg:bg-transparent lg:p-1 ${LINE_GRID}`}
            >
              <legend className="sr-only">Line {i + 1}</legend>
              <div className="col-span-2 flex min-w-0 flex-col gap-1 sm:col-span-3 lg:col-span-1">
                <label htmlFor={`line-${i}-description`} className="text-xs font-medium text-muted-foreground lg:sr-only">
                  Description
                </label>
                <Input
                  id={`line-${i}-description`}
                  value={line.description}
                  onChange={(e) => updateLine(i, { description: e.target.value })}
                  title={line.description || undefined}
                  placeholder="Framing labor and materials"
                  className="min-w-0"
                />
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <label htmlFor={`line-${i}-quantity`} className="text-xs font-medium text-muted-foreground lg:sr-only">
                  Qty
                </label>
                <Input
                  id={`line-${i}-quantity`}
                  inputMode="decimal"
                  value={line.quantity}
                  onChange={(e) => updateLine(i, { quantity: e.target.value })}
                  className="min-w-0 text-right tabular-nums"
                />
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <label htmlFor={`line-${i}-rate`} className="text-xs font-medium text-muted-foreground lg:sr-only">
                  Rate ($)
                </label>
                <Input
                  id={`line-${i}-rate`}
                  inputMode="decimal"
                  value={line.unitRate}
                  onChange={(e) => updateLine(i, { unitRate: e.target.value })}
                  placeholder="0.00"
                  className="min-w-0 text-right tabular-nums"
                />
              </div>
              <div className="col-span-2 flex items-center justify-between gap-3 border-t border-border/60 pt-2 sm:col-span-1 sm:border-0 sm:pt-0 sm:self-end lg:contents">
                <label className="flex h-10 items-center gap-2 text-sm lg:justify-center">
                  <input
                    type="checkbox"
                    checked={line.taxable}
                    onChange={(e) => updateLine(i, { taxable: e.target.checked })}
                    className="size-4 accent-primary"
                  />
                  <span className="lg:sr-only">Taxable</span>
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setLines((prev) => (prev.length === 1 ? [emptyLine()] : prev.filter((_, j) => j !== i)))}
                  aria-label={`Remove line ${i + 1}`}
                  className="justify-self-end text-muted-foreground hover:text-destructive"
                >
                  <Trash2 />
                </Button>
              </div>
            </fieldset>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setLines((prev) => [...prev, emptyLine()])}>
              <Plus data-icon="inline-start" />
              Add line
            </Button>
            {estimate && remaining !== null && remaining > 0 && (
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  setLines((prev) => [
                    ...prev.filter((l) => l.description || l.unitRate),
                    {
                      description: `Billing against estimate ${estimate.estimate_number ?? estimate.name}`,
                      quantity: '1',
                      unitRate: (remaining / 100).toFixed(2),
                      taxable: false,
                    },
                  ])
                }
              >
                Add remaining estimate balance
              </Button>
            )}
          </div>

          <div className="mt-2 flex flex-col gap-4 border-t border-border/60 pt-4 sm:flex-row sm:items-start sm:justify-between">
            <TextField
              name="tax_percent"
              label="Tax rate (%)"
              inputMode="decimal"
              value={taxPercent}
              onChange={(e) => setTaxPercent(e.target.value)}
              error={fe.tax_percent}
              hint="Applied to taxable lines only."
              className="sm:w-44"
            />
            <dl
              className="grid w-full grid-cols-[1fr_auto] gap-x-8 gap-y-1.5 rounded-lg bg-sage/60 p-4 text-sm sm:w-72"
              aria-live="polite"
            >
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="text-right tabular-nums">{formatCentsExact(totals.subtotal)}</dd>
              <dt className="text-muted-foreground">Tax</dt>
              <dd className="text-right tabular-nums">{formatCentsExact(totals.tax)}</dd>
              <dt className="mt-1 border-t border-border pt-2 font-semibold text-foreground">Total</dt>
              <dd className="mt-1 border-t border-border pt-2 text-right text-base font-semibold text-primary tabular-nums">
                {formatCentsExact(totals.total)}
              </dd>
            </dl>
          </div>
          {estimate && remaining !== null && totals.subtotal > remaining && (
            <p role="alert" className="text-sm text-destructive">
              This subtotal is {formatCentsExact(totals.subtotal - remaining)} over the remaining estimate amount. You can save the
              draft, but it cannot be issued until it fits.
            </p>
          )}
        </div>
      </FormSection>

      <FormSection flat={flat} title="Payment details" description="Shown to the homeowner. Payments are recorded by staff; no card processing happens here.">
        <div className="grid gap-5 sm:col-span-2">
          <TextField
            name="payment_terms"
            label="Payment terms"
            defaultValue={v?.payment_terms ?? defaults.payment_terms ?? 'Net 14'}
            error={fe.payment_terms}
          />
          <TextAreaField
            name="payment_instructions"
            label="Payment instructions"
            defaultValue={v?.payment_instructions ?? defaults.payment_instructions ?? ''}
            error={fe.payment_instructions}
            placeholder="Make checks payable to… or ACH to routing / account…"
            rows={3}
          />
          <TextAreaField
            name="notes"
            label="Notes"
            defaultValue={v?.notes ?? defaults.notes ?? ''}
            error={fe.notes}
            rows={3}
          />
        </div>
      </FormSection>

      </SmartFormLayout>
    </form>
  )
}
