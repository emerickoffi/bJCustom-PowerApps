'use client'

import { useActionState, useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TextField, TextAreaField, NativeSelect, FormSection } from '@/components/shared/form-field'
import { saveInvoiceDraft } from '@/app/actions/invoices'
import { initialActionState } from '@/lib/action-state'
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

  return (
    <form action={formAction} className="flex flex-col gap-8" noValidate>
      {defaults.id && <input type="hidden" name="id" value={defaults.id} />}
      {!defaults.id && <input type="hidden" name="id" value="" />}
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />

      {state.error && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {state.error}
        </div>
      )}

      <FormSection title="Who and what" description="The homeowner is taken from the project's primary client when the invoice is issued.">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
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

          <div className="flex flex-col gap-1.5">
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

          <div className="flex flex-col gap-1.5">
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

          {type === 'draw' ? (
            <div className="flex flex-col gap-1.5">
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
        </div>
      </FormSection>

      <FormSection title="Line items" description="Amounts are calculated in whole cents and match the saved invoice exactly.">
        <div className="flex flex-col gap-3">
          <div className="hidden grid-cols-[1fr_96px_140px_80px_40px] gap-3 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground md:grid">
            <span>Description</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Rate ($)</span>
            <span className="text-center">Taxable</span>
            <span className="sr-only">Remove</span>
          </div>
          {lines.map((line, i) => (
            <fieldset
              key={i}
              className="grid grid-cols-2 gap-3 rounded-lg border p-3 md:grid-cols-[1fr_96px_140px_80px_40px] md:items-center md:border-0 md:p-1"
            >
              <legend className="sr-only">Line {i + 1}</legend>
              <Input
                aria-label={`Line ${i + 1} description`}
                value={line.description}
                onChange={(e) => updateLine(i, { description: e.target.value })}
                placeholder="Framing labor and materials"
                className="col-span-2 md:col-span-1"
              />
              <Input
                aria-label={`Line ${i + 1} quantity`}
                inputMode="decimal"
                value={line.quantity}
                onChange={(e) => updateLine(i, { quantity: e.target.value })}
                className="text-right tabular-nums"
              />
              <Input
                aria-label={`Line ${i + 1} rate in dollars`}
                inputMode="decimal"
                value={line.unitRate}
                onChange={(e) => updateLine(i, { unitRate: e.target.value })}
                placeholder="0.00"
                className="text-right tabular-nums"
              />
              <label className="flex items-center gap-2 text-sm md:justify-center">
                <input
                  type="checkbox"
                  checked={line.taxable}
                  onChange={(e) => updateLine(i, { taxable: e.target.checked })}
                  className="size-4 accent-primary"
                />
                <span className="md:sr-only">Taxable</span>
              </label>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setLines((prev) => (prev.length === 1 ? [emptyLine()] : prev.filter((_, j) => j !== i)))}
                aria-label={`Remove line ${i + 1}`}
                className="justify-self-end"
              >
                <Trash2 />
              </Button>
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

          <div className="mt-2 flex flex-col gap-4 border-t pt-4 sm:flex-row sm:items-end sm:justify-between">
            <TextField
              name="tax_percent"
              label="Tax rate (%)"
              inputMode="decimal"
              value={taxPercent}
              onChange={(e) => setTaxPercent(e.target.value)}
              error={fe.tax_percent}
              hint="Applied to taxable lines only."
              className="sm:max-w-40"
            />
            <dl className="grid min-w-56 grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm" aria-live="polite">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="text-right tabular-nums">{formatCentsExact(totals.subtotal)}</dd>
              <dt className="text-muted-foreground">Tax</dt>
              <dd className="text-right tabular-nums">{formatCentsExact(totals.tax)}</dd>
              <dt className="border-t pt-1 font-semibold">Total</dt>
              <dd className="border-t pt-1 text-right font-semibold tabular-nums">{formatCentsExact(totals.total)}</dd>
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

      <FormSection title="Payment details" description="Shown to the homeowner. Payments are recorded by staff; no card processing happens here.">
        <div className="grid gap-5">
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

      <div className="flex flex-wrap justify-end gap-2 border-t pt-6">
        <Button variant="outline" render={<Link href={cancelHref} />} nativeButton={false}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save draft'}
        </Button>
      </div>
    </form>
  )
}
