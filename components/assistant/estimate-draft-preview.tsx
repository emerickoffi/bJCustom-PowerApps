'use client'

import { useId, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertCircle, AlertTriangle, ArrowUpRight, CheckCircle2, Loader2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ESTIMATE_CATEGORIES, ESTIMATE_UNITS, formatCentsExact } from '@/lib/estimates'
import {
  COST_TYPES,
  COST_TYPE_LABELS,
  calculateDraft,
  type DraftItem,
  type DraftProject,
  type DraftProposal,
  type EstimateDraft,
} from '@/lib/ai/estimate-draft'
import { createAssistantEstimateDraftAction, type AssistantEstimateResult } from '@/app/actions/assistant-estimates'

const MONEY = /^\d{1,10}(\.\d{1,2})?$/
const QTY = /^\d{1,9}(\.\d{1,3})?$/
const PCT = /^\d{1,4}(\.\d{1,3})?$/

const clean = (value: string | null, pattern: RegExp) => {
  const v = (value ?? '').replace(/[$,%\s]/g, '')
  return pattern.test(v) ? v : null
}

/** The form keeps what the user typed; calculations only ever see cleanly parsed numbers. */
function toCalculable(draft: EstimateDraft): EstimateDraft {
  return {
    ...draft,
    percent: clean(draft.percent, PCT),
    tax_percent: clean(draft.tax_percent, PCT),
    items: draft.items.map((i) => ({ ...i, quantity: clean(i.quantity, QTY), unit_cost: clean(i.unit_cost, MONEY) })),
  }
}

export function isDraftProposal(raw: unknown): raw is DraftProposal {
  const p = raw as DraftProposal | null
  return Boolean(p && p.draft && Array.isArray(p.draft.items) && Array.isArray(p.projectOptions))
}

type Status = 'editing' | 'cancelled' | 'created'

const fieldClass =
  'h-8 w-full min-w-0 rounded-md border bg-background px-2 text-sm text-foreground outline-none transition-colors focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/15 disabled:opacity-60'
const labelClass = 'text-[11px] font-medium text-muted-foreground'

export function EstimateDraftPreview({
  proposal,
  onRevise,
  onNavigate,
}: {
  proposal: DraftProposal
  onRevise: () => void
  onNavigate: () => void
}) {
  const router = useRouter()
  const uid = useId()
  const [draft, setDraft] = useState<EstimateDraft>(proposal.draft)
  const [projectId, setProjectId] = useState(proposal.project?.id ?? '')
  const [creationKey] = useState(() => crypto.randomUUID())
  const [status, setStatus] = useState<Status>('editing')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Extract<AssistantEstimateResult, { ok: true }> | null>(null)
  const [saving, startSaving] = useTransition()

  const projects: DraftProject[] = useMemo(() => {
    const list = [...proposal.projectOptions]
    if (proposal.project && !list.some((p) => p.id === proposal.project!.id)) list.unshift(proposal.project)
    return list
  }, [proposal])
  const project = projects.find((p) => p.id === projectId) ?? null
  const calculable = useMemo(() => toCalculable(draft), [draft])
  const calc = useMemo(() => calculateDraft(calculable, project), [calculable, project])
  const blocking = calc.issues.filter((i) => i.level === 'block')
  const warnings = calc.issues.filter((i) => i.level === 'warn')
  const locked = status !== 'editing' || saving

  const update = (patch: Partial<EstimateDraft>) => setDraft((d) => ({ ...d, ...patch }))
  const updateItem = (index: number, patch: Partial<DraftItem>) =>
    setDraft((d) => ({ ...d, items: d.items.map((item, i) => (i === index ? { ...item, ...patch } : item)) }))

  function create() {
    if (blocking.length || locked || !project) return
    setError(null)
    startSaving(async () => {
      try {
        const res = await createAssistantEstimateDraftAction({ projectId: project.id, creationKey, draft: calculable })
        if (!res.ok) {
          setError(res.error)
          return
        }
        setResult(res)
        setStatus('created')
        router.refresh()
      } catch {
        setError('The estimate could not be created because of a network problem. Your draft is kept; try again.')
      }
    })
  }

  if (status === 'cancelled') {
    return (
      <p className="rounded-xl border border-dashed bg-card/60 px-3 py-2 text-xs text-muted-foreground">
        Draft estimate discarded. Nothing was created.
      </p>
    )
  }

  if (status === 'created' && result) {
    return (
      <section aria-label="Draft estimate created" className="flex flex-col gap-2 rounded-xl border border-primary/30 bg-sage/40 px-3 py-2.5">
        <p className="flex items-start gap-2 text-sm text-foreground">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <span>
            {result.alreadyExisted ? 'This draft was already created: ' : 'Draft estimate created: '}
            <strong className="font-semibold">{result.estimateNumber}</strong> for {result.projectName}. It has not been sent or approved.
          </span>
        </p>
        <Link
          href={result.href}
          onClick={onNavigate}
          className="inline-flex w-fit items-center gap-1 rounded-lg border border-primary/25 bg-card px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-sage focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          Open estimate
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </Link>
      </section>
    )
  }

  return (
    <section aria-label="Draft estimate preview" className="flex flex-col gap-3 rounded-xl border bg-card px-3 py-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-semibold text-muted-foreground">Draft estimate preview</span>
        <span className="text-xs text-muted-foreground">Nothing is saved until you click Create draft estimate. Totals are calculated by the app.</span>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={`${uid}-project`} className={labelClass}>
          Project
        </label>
        {projects.length > 1 || !proposal.project ? (
          <select
            id={`${uid}-project`}
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            disabled={locked}
            className={fieldClass}
          >
            <option value="">Select a project…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.number ? `${p.name} · ${p.number}` : p.name}
              </option>
            ))}
          </select>
        ) : (
          <p id={`${uid}-project`} className="text-sm font-semibold text-foreground">
            {proposal.project.name}
            {proposal.project.number && <span className="font-normal text-muted-foreground">{` · ${proposal.project.number}`}</span>}
          </p>
        )}
        {proposal.projectNote && !project && <p className="text-xs text-amber-800">{proposal.projectNote}</p>}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={`${uid}-title`} className={labelClass}>
          Estimate title
        </label>
        <input
          id={`${uid}-title`}
          value={draft.title}
          onChange={(e) => update({ title: e.target.value })}
          maxLength={200}
          disabled={locked}
          className={fieldClass}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-basis`} className={labelClass}>
            Amounts are
          </label>
          <select
            id={`${uid}-basis`}
            value={draft.amount_basis}
            onChange={(e) => update({ amount_basis: e.target.value as EstimateDraft['amount_basis'] })}
            disabled={locked}
            className={fieldClass}
          >
            <option value="unknown">Not confirmed</option>
            <option value="cost">Builder costs</option>
            <option value="selling_price">Selling prices</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-markup`} className={labelClass}>
            Markup %
          </label>
          <input
            id={`${uid}-markup`}
            inputMode="decimal"
            value={draft.percent ?? ''}
            onChange={(e) => update({ percent: e.target.value || null })}
            disabled={locked}
            placeholder="None"
            className={cn(fieldClass, 'tabular-nums')}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-estimate-date`} className={labelClass}>
            Estimate date
          </label>
          <input
            id={`${uid}-estimate-date`}
            type="date"
            required
            value={draft.estimate_date ?? ''}
            onChange={(e) => update({ estimate_date: e.target.value || null })}
            disabled={locked}
            className={cn(fieldClass, 'tabular-nums')}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-expiration-date`} className={labelClass}>
            Expiration date
          </label>
          <input
            id={`${uid}-expiration-date`}
            type="date"
            min={draft.estimate_date ?? undefined}
            value={draft.expiration_date ?? ''}
            onChange={(e) => update({ expiration_date: e.target.value || null })}
            disabled={locked}
            className={cn(fieldClass, 'tabular-nums')}
          />
        </div>
        {draft.percent && Number(clean(draft.percent, PCT)) > 0 && (
          <>
            <div className="flex flex-col gap-1">
              <label htmlFor={`${uid}-kind`} className={labelClass}>
                Percentage means
              </label>
              <select
                id={`${uid}-kind`}
                value={draft.percent_kind}
                onChange={(e) => update({ percent_kind: e.target.value as EstimateDraft['percent_kind'] })}
                disabled={locked}
                className={fieldClass}
              >
                <option value="unknown">Not confirmed</option>
                <option value="markup">Markup on cost</option>
                <option value="margin">Margin on price</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={`${uid}-scope`} className={labelClass}>
                Applies to
              </label>
              <select
                id={`${uid}-scope`}
                value={draft.markup_scope}
                onChange={(e) => update({ markup_scope: e.target.value as EstimateDraft['markup_scope'] })}
                disabled={locked}
                className={fieldClass}
              >
                <option value="unknown">Not confirmed</option>
                <option value="all">All items</option>
                <option value="some">Some items</option>
              </select>
            </div>
          </>
        )}
      </div>

      <ol className="flex flex-col gap-2" aria-label="Line items">
        {draft.items.map((item, i) => (
          <LineEditor
            key={i}
            id={`${uid}-line-${i}`}
            index={i}
            item={item}
            totalCents={calc.lines[i]}
            disabled={locked}
            onChange={(patch) => updateItem(i, patch)}
            onRemove={() => setDraft((d) => ({ ...d, items: d.items.filter((_, j) => j !== i) }))}
          />
        ))}
      </ol>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 w-fit gap-1.5 text-xs"
        disabled={locked || draft.items.length >= 200}
        onClick={() =>
          setDraft((d) => ({
            ...d,
            items: [
              ...d.items,
              { description: '', category: 'Other', cost_type: 'unspecified', quantity: '1', unit: 'ea', unit_cost: null, lump_sum: false, source_text: null },
            ],
          }))
        }
      >
        <Plus className="size-3.5" aria-hidden="true" />
        Add line
      </Button>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-notes`} className={labelClass}>
            Notes
          </label>
          <textarea
            id={`${uid}-notes`}
            rows={3}
            maxLength={5000}
            value={draft.notes ?? ''}
            onChange={(e) => update({ notes: e.target.value || null })}
            disabled={locked}
            placeholder="None"
            className={cn(fieldClass, 'h-auto py-1.5')}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-exclusions`} className={labelClass}>
            Exclusions (saved in Notes)
          </label>
          <textarea
            id={`${uid}-exclusions`}
            rows={3}
            maxLength={3000}
            value={draft.exclusions ?? ''}
            onChange={(e) => update({ exclusions: e.target.value || null })}
            disabled={locked}
            placeholder="None"
            className={cn(fieldClass, 'h-auto py-1.5')}
          />
        </div>
      </div>

      <dl className="flex flex-col gap-1 border-t pt-2 text-sm">
        <TotalRow label="Cost subtotal" cents={calc.costSubtotalCents} />
        <TotalRow label={`Markup at ${Number(calc.markupPercent).toLocaleString('en-US', { maximumFractionDigits: 3 })}%`} cents={calc.markupCents} />
        <TotalRow label="Tax" text="Not applied" />
        <TotalRow label="Selling price" cents={calc.sellingCents} strong />
      </dl>

      {(blocking.length > 0 || warnings.length > 0) && (
        <ul className="flex flex-col gap-1" aria-label="Needs attention">
          {blocking.map((issue) => (
            <li key={issue.message} className="flex items-start gap-1.5 text-xs leading-snug text-destructive">
              <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
              {issue.message}
            </li>
          ))}
          {warnings.map((issue) => (
            <li key={issue.message} className="flex items-start gap-1.5 text-xs leading-snug text-amber-800">
              <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
              {issue.message}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="flex items-start gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-xs text-destructive">
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={create} disabled={locked || blocking.length > 0} className="gap-1.5">
          {saving && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
          {saving ? 'Creating…' : 'Create draft estimate'}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onRevise} disabled={locked}>
          Revise
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setStatus('cancelled')} disabled={locked}>
          Cancel
        </Button>
      </div>
    </section>
  )
}

function LineEditor({
  id,
  index,
  item,
  totalCents,
  disabled,
  onChange,
  onRemove,
}: {
  id: string
  index: number
  item: DraftItem
  totalCents: number | null
  disabled: boolean
  onChange: (patch: Partial<DraftItem>) => void
  onRemove: () => void
}) {
  const missingCost = !clean(item.unit_cost, MONEY)
  const missingQty = !clean(item.quantity, QTY)
  return (
    <li className="flex flex-col gap-1.5 rounded-lg border bg-background/60 p-2">
      <div className="flex items-start gap-1.5">
        <label htmlFor={`${id}-desc`} className="sr-only">{`Line ${index + 1} description`}</label>
        <input
          id={`${id}-desc`}
          value={item.description}
          onChange={(e) => onChange({ description: e.target.value })}
          maxLength={500}
          disabled={disabled}
          placeholder="Description"
          className={cn(fieldClass, 'font-medium')}
        />
        <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove} disabled={disabled} aria-label={`Remove line ${index + 1}`}>
          <Trash2 aria-hidden="true" />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <select aria-label={`Line ${index + 1} category`} value={item.category} onChange={(e) => onChange({ category: e.target.value as DraftItem['category'] })} disabled={disabled} className={fieldClass}>
          {ESTIMATE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select aria-label={`Line ${index + 1} cost type`} value={item.cost_type} onChange={(e) => onChange({ cost_type: e.target.value as DraftItem['cost_type'] })} disabled={disabled} className={fieldClass}>
          {COST_TYPES.map((c) => (
            <option key={c} value={c}>
              {COST_TYPE_LABELS[c]}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-[1fr_1fr_1.3fr] gap-1.5">
        <input
          aria-label={`Line ${index + 1} quantity`}
          inputMode="decimal"
          value={item.quantity ?? ''}
          onChange={(e) => onChange({ quantity: e.target.value || null, lump_sum: false })}
          disabled={disabled}
          placeholder="Qty"
          aria-invalid={missingQty}
          className={cn(fieldClass, 'tabular-nums', missingQty && 'border-destructive/60')}
        />
        <select
          aria-label={`Line ${index + 1} unit`}
          value={item.unit}
          onChange={(e) => onChange({ unit: e.target.value as DraftItem['unit'], lump_sum: false })}
          disabled={disabled}
          className={fieldClass}
        >
          {ESTIMATE_UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        <input
          aria-label={`Line ${index + 1} unit cost in dollars`}
          inputMode="decimal"
          value={item.unit_cost ?? ''}
          onChange={(e) => onChange({ unit_cost: e.target.value || null })}
          disabled={disabled}
          placeholder="Missing $"
          aria-invalid={missingCost}
          className={cn(fieldClass, 'tabular-nums', missingCost && 'border-destructive/60 placeholder:text-destructive')}
        />
      </div>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{item.lump_sum ? 'Lump sum' : item.source_text ? `From: “${item.source_text}”` : ''}</span>
        <span className={cn('shrink-0 font-semibold tabular-nums', totalCents === null ? 'text-destructive' : 'text-foreground')}>
          {totalCents === null ? 'Incomplete' : formatCentsExact(totalCents)}
        </span>
      </div>
    </li>
  )
}

function TotalRow({ label, cents, text, strong }: { label: string; cents?: number | null; text?: string; strong?: boolean }) {
  const value = text ?? (cents === null || cents === undefined ? 'Incomplete' : formatCentsExact(cents))
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={cn('text-muted-foreground', strong && 'font-semibold text-foreground')}>{label}</dt>
      <dd className={cn('tabular-nums', strong ? 'font-semibold text-foreground' : 'text-foreground', value === 'Incomplete' && 'text-destructive')}>{value}</dd>
    </div>
  )
}
