'use client'

import { useEffect, useId, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { toast } from 'sonner'
import {
  ChevronDown as ChevronDownIcon,
  FileText as FileTextIcon,
  NotebookPen as NotebookPenIcon,
  Percent as PercentIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { FormSection, TextField } from '@/components/shared/form-field'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'
import { type ActionState } from '@/lib/action-state'
import { SaveBanners, SaveStatus, useResilientSave } from '@/components/shared/resilient-save'
import { SmartFormLayout, useSmartForm } from '@/components/shared/smart-form'
import { EstimateDetailFields, EstimatePricingFields } from '@/components/estimates/estimate-pricing-fields'

export type EstimateProjectOption = {
  id: string
  label: string
  clientName: string | null
}

export type EstimateFormDefaults = {
  id?: string
  /** Server timestamp when the form loaded; used to detect edits made elsewhere. */
  updated_at?: string
  project_id?: string
  name?: string
  description?: string | null
  estimate_date?: string
  expiration_date?: string | null
  markup_percent?: string
  contingency_percent?: string
  land_cost?: string
  notes?: string | null
  is_demo?: boolean
}

const PRICING_FIELDS = ['markup_percent', 'contingency_percent', 'land_cost'] as const
const DETAIL_FIELDS = ['description', 'notes'] as const
/** Settings edited in the estimate editor. New estimates submit them unchanged (defaults or restored values). */
const MOVED_DEFAULTS: Record<(typeof PRICING_FIELDS)[number] | (typeof DETAIL_FIELDS)[number], string> = {
  description: '',
  notes: '',
  markup_percent: '0',
  contingency_percent: '0',
  land_cost: '',
}
const MOVED_FIELDS = Object.keys(MOVED_DEFAULTS) as (keyof typeof MOVED_DEFAULTS)[]

export function EstimateForm({
  action,
  defaults,
  projects,
  fixedProject,
  estimateNumber,
  cancelHref,
  submitLabel,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>
  defaults: EstimateFormDefaults
  projects?: EstimateProjectOption[]
  /** Read-only project and client shown when the project can't be changed (editing). */
  fixedProject?: { label: string; clientName: string | null }
  estimateNumber?: string
  cancelHref: string
  submitLabel: string
}) {
  const isNew = !defaults.id
  const save = useResilientSave({
    kind: 'estimate',
    formType: 'estimate',
    projectId: defaults.project_id ?? null,
    recordId: defaults.id ?? null,
    baseRevision: defaults.updated_at ?? null,
    action,
  })
  const { state, formAction } = save
  const fe = state.fieldErrors ?? {}
  const v: Record<string, string> = state.values ?? (save.restored ? Object.fromEntries(save.restored.entries) : {})
  const formKey = `${save.restoreKey}:${state.values ? JSON.stringify(state.values) : 'initial'}`

  const [projectId, setProjectId] = useState(v.project_id ?? defaults.project_id ?? '')
  const [detailsOpen, setDetailsOpen] = useState(Boolean(defaults.description || defaults.notes))
  const [pricingOpen, setPricingOpen] = useState(true)

  // A new save result or restored draft remounts the form; resync the project and open any collapsed
  // section holding an error before the first invalid field is focused.
  const [syncedKey, setSyncedKey] = useState(formKey)
  if (syncedKey !== formKey) {
    setSyncedKey(formKey)
    if (v.project_id !== undefined) setProjectId(v.project_id)
    if (DETAIL_FIELDS.some((f) => fe[f])) setDetailsOpen(true)
    if (PRICING_FIELDS.some((f) => fe[f])) setPricingOpen(true)
  }

  const selected = projects?.find((p) => p.id === projectId)
  const { inOverlay: flat, dirty, formProps } = useSmartForm(state, formKey)
  const setFormRef = (node: HTMLFormElement | null) => {
    formProps.ref.current = node
    save.formRef.current = node
  }

  useEffect(() => {
    if (!isNew || !state.savedId) return
    if (state.values?.intent === 'draft') toast.success('Draft saved. Reopen it anytime from Estimates.')
    else toast.success('Estimate created. Add your cost items.')
  }, [state, isNew])

  const movedValue = (f: keyof typeof MOVED_DEFAULTS) => v[f] ?? defaults[f] ?? MOVED_DEFAULTS[f]
  // New estimates keep these settings in hidden inputs; they only appear here if a restored value is invalid.
  const showMovedFields = !isNew || MOVED_FIELDS.some((f) => fe[f])
  const carriesRestoredSettings = isNew && Boolean(save.restored) && MOVED_FIELDS.some((f) => movedValue(f) !== MOVED_DEFAULTS[f])

  const clientName = projects
    ? selected
      ? (selected.clientName ?? 'No primary client linked to this project')
      : null
    : (fixedProject?.clientName ?? 'No primary client')

  return (
    <div className={flat ? 'flex min-h-0 flex-1 flex-col' : 'flex flex-col gap-4'}>
      <form key={formKey} action={formAction} {...formProps} ref={setFormRef}>
        {defaults.id && defaults.updated_at && <input type="hidden" name="expected_updated_at" value={defaults.updated_at} />}
        {isNew && <input type="hidden" name="return_to" value={cancelHref} />}
        {/* Demo records keep their classification; the normal form never creates new demo data. */}
        {!isNew && defaults.is_demo && <input type="hidden" name="is_demo" value="on" />}
        {!showMovedFields && MOVED_FIELDS.map((f) => <input key={f} type="hidden" name={f} value={movedValue(f)} />)}
        <SmartFormLayout
          dirty={dirty}
          cancelHref={cancelHref}
          footerClassName={isNew ? 'shadow-[0_-8px_20px_-12px_rgb(0_0_0/0.18)]' : undefined}
          actionsClassName={
            isNew ? 'grid grid-cols-2 gap-2 sm:flex sm:flex-row sm:items-center sm:justify-end [&>*:last-child]:col-span-2' : undefined
          }
          message={
            <div className="flex flex-col gap-2 empty:hidden">
              <SaveStatus save={save} />
              <FormMessage state={state} />
            </div>
          }
          submit={
            isNew ? (
              <>
                <IntentButton intent="draft" variant="outline">
                  Save draft
                </IntentButton>
                <IntentButton intent="items">Create &amp; add cost items</IntentButton>
              </>
            ) : (
              <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
            )
          }
        >
          <div className={cn('flex flex-col gap-2 empty:hidden', flat && 'pt-4')}>
            <SaveBanners save={save} compact latestHref={defaults.id ? `/estimates/${defaults.id}` : undefined} />
            {carriesRestoredSettings && (
              <p className="text-xs text-muted-foreground">
                Restored description, notes and pricing settings are kept and saved with this estimate. Edit them in the estimate editor.
              </p>
            )}
          </div>

          <FormSection flat={flat} icon={isNew ? undefined : FileTextIcon} title={isNew ? 'Estimate' : 'Estimate setup'}>
            {projects ? (
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label htmlFor="project_id" className="text-sm font-medium leading-none">
                  Project
                  <span className="text-destructive" aria-hidden="true">
                    *
                  </span>
                  <span className="sr-only">(required)</span>
                </label>
                <select
                  id="project_id"
                  name="project_id"
                  required
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  aria-invalid={fe.project_id ? true : undefined}
                  aria-describedby="project_id-client"
                  className="h-10 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive"
                >
                  <option value="">
                    Select a project
                  </option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
                {fe.project_id && <p className="text-xs text-destructive">{fe.project_id}</p>}
                <p id="project_id-client" className="text-xs text-muted-foreground">
                  {'Client: '}
                  <span className="font-medium text-foreground">{clientName ?? 'Select a project to see its client'}</span>
                </p>
              </div>
            ) : fixedProject ? (
              <div className="flex flex-col gap-1 sm:col-span-2">
                <span className="text-sm font-medium leading-none">Project</span>
                <span className="text-sm text-foreground">{fixedProject.label}</span>
                <span className="text-xs text-muted-foreground">
                  {'Client: '}
                  <span className="font-medium text-foreground">{clientName}</span>
                </span>
              </div>
            ) : null}

            <TextField
              name="name"
              label="Estimate name"
              required
              defaultValue={v.name ?? defaults.name ?? ''}
              error={fe.name}
              placeholder="e.g. Base construction estimate"
              hint={!isNew && estimateNumber ? `Estimate number ${estimateNumber}` : undefined}
              className="sm:col-span-2"
            />
            <TextField
              name="estimate_date"
              label="Estimate date"
              type="date"
              required
              defaultValue={v.estimate_date ?? defaults.estimate_date ?? ''}
              error={fe.estimate_date}
            />
            <TextField
              name="expiration_date"
              label="Expiration date"
              type="date"
              defaultValue={v.expiration_date ?? defaults.expiration_date ?? ''}
              error={fe.expiration_date}
              hint="Optional"
            />
            {isNew && <p className="text-xs text-muted-foreground sm:col-span-2">Estimate number assigned when saved.</p>}
            {!isNew && defaults.is_demo && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground sm:col-span-2">
                <span className="rounded-badge bg-champagne-soft px-2 py-0.5 font-medium text-warning">Demo data</span>
                This estimate stays labeled as demo / sample data.
              </p>
            )}
          </FormSection>

          {showMovedFields && (
            <>
              <Disclosure
                flat={flat}
                icon={NotebookPenIcon}
                title="Optional details"
                summary="Description and notes for the estimate page and PDF"
                open={detailsOpen}
                onOpenChange={setDetailsOpen}
              >
                <EstimateDetailFields description={movedValue('description')} notes={movedValue('notes')} errors={fe} />
              </Disclosure>

              <Disclosure
                flat={flat}
                icon={PercentIcon}
                title="Pricing settings"
                summary="Markup, contingency and optional land cost"
                open={pricingOpen}
                onOpenChange={setPricingOpen}
              >
                <EstimatePricingFields
                  markup={movedValue('markup_percent')}
                  contingency={movedValue('contingency_percent')}
                  land={movedValue('land_cost')}
                  savedLandCost={defaults.land_cost ?? null}
                  errors={fe}
                />
              </Disclosure>
            </>
          )}
        </SmartFormLayout>
      </form>
    </div>
  )
}

/** Submit button that names its intent and only shows the pending label on the one that was pressed. */
function IntentButton({
  intent,
  variant,
  children,
}: {
  intent: 'draft' | 'items'
  variant?: React.ComponentProps<typeof Button>['variant']
  children: React.ReactNode
}) {
  const { pending, data } = useFormStatus()
  return (
    <Button type="submit" name="intent" value={intent} variant={variant} size="lg" disabled={pending} aria-busy={pending || undefined}>
      {pending && data?.get('intent') === intent ? 'Saving…' : children}
    </Button>
  )
}

/** Collapsible form section. Fields stay mounted while collapsed so their values are always submitted. */
function Disclosure({
  flat,
  icon: Icon,
  title,
  summary,
  open,
  onOpenChange,
  children,
}: {
  flat: boolean
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>
  title: string
  summary: string
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}) {
  const id = useId()
  return (
    <details
      open={open}
      onToggle={(e) => onOpenChange(e.currentTarget.open)}
      className={cn(
        'group',
        flat ? 'border-b border-border/60 py-4 last:border-b-0' : 'rounded-xl border border-border/80 bg-card shadow-xs',
      )}
    >
      <summary
        aria-describedby={`${id}-summary`}
        className={cn(
          'flex cursor-pointer list-none items-center gap-3 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden',
          flat ? 'min-h-11' : 'min-h-11 p-5 sm:px-6',
        )}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sage text-primary ring-1 ring-inset ring-primary/10">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-semibold text-foreground">{title}</span>
          <span id={`${id}-summary`} className="truncate text-xs text-muted-foreground">
            {summary}
          </span>
        </span>
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className={cn('grid gap-4 sm:grid-cols-2', flat ? 'pt-4' : 'border-t border-border/60 p-5 sm:px-6')}>{children}</div>
    </details>
  )
}
