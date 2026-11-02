'use client'

import {
  House as HouseIcon,
  MapPin as MapPinIcon,
  CalendarRange as CalendarRangeIcon,
  ListChecks as ListChecksIcon,
  Lock as LockIcon,
  Image as ImageIcon,
  Plus as PlusIcon,
} from 'lucide-react'
import { CreateClientDialog } from '@/components/projects/create-client-dialog'
import { useActionState, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { formValues, initialActionState, type ActionState } from '@/lib/action-state'
import { validateCoverFile } from '@/lib/project-cover'
import { CoverImageField, uploadProjectCover } from '@/components/projects/cover-image-field'
import { PROJECT_TYPE_LABELS } from '@/lib/domain'
import { calculateTargetCompletion, parseBusinessDays } from '@/lib/business-days'
import { cn } from '@/lib/utils'
import { FormSection, SelectField, TextAreaField, TextField } from '@/components/shared/form-field'
import { SmartFormLayout, useSmartForm } from '@/components/shared/smart-form'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'

export type ProjectFormValues = {
  name?: string
  primary_client_id?: string
  project_type?: string
  description?: string | null
  address_line1?: string
  address_line2?: string | null
  city?: string
  state?: string
  postal_code?: string
  lot?: string | null
  block?: string | null
  phase?: string | null
  community?: string | null
  legal_description?: string | null
  estimated_budget_cents?: number | null
  proposed_start_date?: string | null
  target_completion_date?: string | null
  planned_business_days?: number | null
  project_manager_id?: string | null
  internal_notes?: string | null
  cover_image_kind?: string | null
}

type Option = { value: string; label: string }

export type ClientMailingAddress = {
  address_line1: string
  address_line2: string
  city: string
  state: string
  postal_code: string
}

export type ProjectFormCover = { orgId: string; savedUrl?: string | null; savedKind?: string | null }

const usd = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

function formatBudget(raw: string) {
  const cleaned = raw.replace(/[$,\s]/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return raw
  return usd.format(Number(cleaned))
}

export function ProjectForm({
  action,
  defaults = {},
  clientOptions,
  managerOptions,
  submitLabel,
  pendingLabel,
  cancelHref,
  scheduleSetup,
  cover,
  clientAddresses: initialClientAddresses,
  canCreateClient = false,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>
  defaults?: ProjectFormValues
  clientOptions: Option[]
  /** Shows “Create new client” beside the homeowner selector. Only pass for users allowed to create clients. */
  canCreateClient?: boolean
  managerOptions: Option[]
  submitLabel: string
  pendingLabel?: string
  cancelHref: string
  /** Only passed on create. `true` when the Schedule feature is on; `false` shows it as unavailable; omitted hides it. */
  scheduleSetup?: boolean
  cover?: ProjectFormCover
  /** Mailing addresses keyed by client id. Copied into the site fields only when the user asks. */
  clientAddresses?: Record<string, ClientMailingAddress>
}) {
  const [addressNotice, setAddressNotice] = useState<{ tone: 'success' | 'info'; text: string } | null>(null)

  // Clients created inline are appended here so the selector updates without a reload.
  const [options, setOptions] = useState(clientOptions)
  const [clientAddresses, setClientAddresses] = useState(initialClientAddresses)
  const [clientDialogOpen, setClientDialogOpen] = useState(false)
  const [pendingClientId, setPendingClientId] = useState<string | null>(null)
  const [clientNotice, setClientNotice] = useState<string | null>(null)
  const clientSelectRef = useRef<HTMLElement | null>(null)

  const getClientSelect = () =>
    (formRef.current?.elements.namedItem('primary_client_id') as HTMLSelectElement | null) ?? null

  const openClientDialog = () => {
    clientSelectRef.current = getClientSelect()
    setClientDialogOpen(true)
  }

  const chooseClient = (option: Option, address?: ClientMailingAddress) => {
    setOptions((prev) => (prev.some((o) => o.value === option.value) ? prev : [...prev, option]))
    if (address && Object.values(address).some(Boolean)) {
      setClientAddresses((prev) => (prev ? { ...prev, [option.value]: address } : prev))
    }
    setPendingClientId(option.value)
    setClientDialogOpen(false)
  }

  // Select the client after its <option> has rendered, then notify listeners (dirty tracking).
  useEffect(() => {
    if (!pendingClientId) return
    const select = getClientSelect()
    if (select && [...select.options].some((o) => o.value === pendingClientId)) {
      select.value = pendingClientId
      select.dispatchEvent(new Event('change', { bubbles: true }))
      const label = select.selectedOptions[0]?.textContent ?? 'Client'
      setClientNotice(`${label} selected as the primary homeowner.`)
    }
    setPendingClientId(null)
    // getClientSelect reads a ref; only the pending id matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingClientId, options])

  const copyClientMailingAddress = () => {
    const form = formRef.current
    if (!form || !clientAddresses) return
    const clientId = (form.elements.namedItem('primary_client_id') as HTMLSelectElement | null)?.value
    if (!clientId) {
      setAddressNotice({ tone: 'info', text: 'Choose the primary homeowner first.' })
      return
    }
    const address = clientAddresses[clientId]
    if (!address) {
      setAddressNotice({ tone: 'info', text: 'This client has no mailing address on file. Enter the site address below.' })
      return
    }
    for (const [name, value] of Object.entries(address)) {
      const input = form.elements.namedItem(name) as HTMLInputElement | null
      if (input) input.value = value
    }
    setAddressNotice({
      tone: 'success',
      text: 'Copied the client’s mailing address. Check it matches the construction site before saving.',
    })
  }

  const [coverFile, setCoverFile] = useState<{ file: File; url: string } | null>(null)
  const [removeSavedCover, setRemoveSavedCover] = useState(false)
  const [coverError, setCoverError] = useState<string | null>(null)
  // The wrapped action reads the latest selection at submit time.
  const coverRef = useRef({ file: null as File | null, remove: false })

  useEffect(() => () => {
    if (coverFile) URL.revokeObjectURL(coverFile.url)
  }, [coverFile])

  const [state, formAction] = useActionState(async (prev: ActionState, formData: FormData) => {
    const { file, remove } = coverRef.current
    if (cover && file) {
      const upload = await uploadProjectCover(cover.orgId, file)
      if ('error' in upload) return { error: upload.error, fieldErrors: { cover_image: upload.error }, values: formValues(formData) }
      formData.set('cover_action', 'replace')
      formData.set('cover_image_path', upload.path)
    } else {
      formData.set('cover_action', remove ? 'remove' : 'keep')
    }
    return action(prev, formData)
  }, initialActionState)
  const fe = state.fieldErrors ?? {}
  const sv = state.values
  const formKey = sv ? JSON.stringify(sv) : 'initial'
  const { inOverlay: flat, dirty, formProps } = useSmartForm(state, formKey)
  const formRef = formProps.ref
  // After a failed submit, re-seed every field from what the builder entered so nothing is lost.
  const v = (key: keyof ProjectFormValues, fallback?: string | null) => (sv ? (sv[key] ?? '') : (fallback ?? ''))
  const budgetDefault = sv
    ? (sv.estimated_budget ?? '')
    : defaults.estimated_budget_cents != null
      ? usd.format(defaults.estimated_budget_cents / 100)
      : ''

  const [startDate, setStartDate] = useState(v('proposed_start_date', defaults.proposed_start_date))
  const [businessDays, setBusinessDays] = useState(
    sv ? (sv.planned_business_days ?? '') : defaults.planned_business_days != null ? String(defaults.planned_business_days) : '',
  )
  const [targetDate, setTargetDate] = useState(v('target_completion_date', defaults.target_completion_date))
  const businessDaysError = parseBusinessDays(businessDays).error
  const calculatedTarget = calculateTargetCompletion(startDate, businessDays)
  const isCalculated = calculatedTarget !== null && calculatedTarget === targetDate

  const updateSchedule = (start: string, days: string) => {
    setStartDate(start)
    setBusinessDays(days)
    const next = calculateTargetCompletion(start, days)
    if (next) setTargetDate(next)
  }
  const [scheduleMode, setScheduleMode] = useState(sv?.schedule_setup ?? 'standard')

  return (
    <>
    <form key={formKey} action={formAction} {...formProps} noValidate={false}>
      <SmartFormLayout
        dirty={dirty}
        cancelHref={cancelHref}
        message={<FormMessage state={state} />}
        submit={<SubmitButton pendingLabel={pendingLabel}>{submitLabel}</SubmitButton>}
      >
      <FormSection flat={flat} icon={HouseIcon} title="Project" description="Name the project and choose the homeowner it is being built for.">
        <TextField name="name" label="Project name" required defaultValue={v('name', defaults.name)} error={fe.name} className="sm:col-span-2" />
        <SelectField
          name="primary_client_id"
          label="Primary homeowner"
          required
          placeholder="Select a client"
          options={options}
          defaultValue={v('primary_client_id', defaults.primary_client_id)}
          error={fe.primary_client_id}
          labelAction={
            canCreateClient ? (
              <Button type="button" variant="link" size="sm" className="h-auto gap-1 p-0" onClick={openClientDialog}>
                <PlusIcon className="size-3.5" aria-hidden="true" />
                Create new client
              </Button>
            ) : undefined
          }
          hint={
            clientNotice ??
            (options.length
              ? 'Other contacts on this client get project access only through portal access settings.'
              : canCreateClient
                ? 'No clients yet. Use “Create new client” to add one.'
                : 'Create a client first.')
          }
        />
        <SelectField
          name="project_type"
          label="Project type"
          required
          options={Object.entries(PROJECT_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
          defaultValue={v('project_type', defaults.project_type ?? 'new_custom_home')}
          error={fe.project_type}
        />
        <TextAreaField
          name="description"
          label="Description"
          defaultValue={v('description', defaults.description)}
          error={fe.description}
          className="sm:col-span-2"
        />
      </FormSection>

      {cover && (
        <FormSection flat={flat}
          icon={ImageIcon}
          title="Project Cover Image"
          description="Upload an architectural rendering, 3D visualization, or photograph of the home."
        >
          <CoverImageField
            previewUrl={coverFile?.url ?? (removeSavedCover ? null : (cover.savedUrl ?? null))}
            fileName={coverFile?.file.name ?? null}
            kindDefault={v('cover_image_kind', cover.savedKind)}
            error={coverError ?? fe.cover_image}
            onSelect={(file) => {
              const invalid = validateCoverFile(file)
              setCoverError(invalid)
              if (invalid) return
              coverRef.current = { file, remove: false }
              setCoverFile({ file, url: URL.createObjectURL(file) })
            }}
            onRemove={() => {
              setCoverError(null)
              coverRef.current = { file: null, remove: Boolean(cover.savedUrl) }
              setCoverFile(null)
              setRemoveSavedCover(Boolean(cover.savedUrl))
            }}
          />
        </FormSection>
      )}

      <FormSection flat={flat} icon={MapPinIcon} title="Site" description="Where the home is being built. This is separate from the homeowner's mailing address.">
        {clientAddresses && (
          <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row sm:items-center">
            <Button type="button" variant="outline" size="sm" className="self-start" onClick={copyClientMailingAddress}>
              Use client mailing address
            </Button>
            {addressNotice && (
              <p
                role="status"
                className={cn('text-sm', addressNotice.tone === 'success' ? 'text-primary' : 'text-muted-foreground')}
              >
                {addressNotice.text}
              </p>
            )}
          </div>
        )}
        <TextField name="address_line1" label="Street address" required autoComplete="off" defaultValue={v('address_line1', defaults.address_line1)} error={fe.address_line1} className="sm:col-span-2" />
        <TextField name="address_line2" label="Address line 2" autoComplete="off" defaultValue={v('address_line2', defaults.address_line2)} error={fe.address_line2} className="sm:col-span-2" />
        <div className="grid gap-5 sm:col-span-2 sm:grid-cols-6">
          <TextField name="city" label="City" required defaultValue={v('city', defaults.city)} error={fe.city} className="sm:col-span-3" />
          <TextField name="state" label="State" required defaultValue={v('state', defaults.state)} error={fe.state} className="sm:col-span-1" />
          <TextField name="postal_code" label="ZIP" required inputMode="numeric" defaultValue={v('postal_code', defaults.postal_code)} error={fe.postal_code} className="sm:col-span-2" />
        </div>
        <div className="grid grid-cols-3 gap-5 sm:col-span-2 lg:grid-cols-6">
          <TextField name="community" label="Community / subdivision" defaultValue={v('community', defaults.community)} error={fe.community} className="col-span-3" />
          <TextField name="lot" label="Lot" defaultValue={v('lot', defaults.lot)} error={fe.lot} />
          <TextField name="block" label="Block" defaultValue={v('block', defaults.block)} error={fe.block} />
          <TextField name="phase" label="Phase" defaultValue={v('phase', defaults.phase)} error={fe.phase} />
        </div>
        <TextAreaField name="legal_description" label="Legal description" defaultValue={v('legal_description', defaults.legal_description)} error={fe.legal_description} className="sm:col-span-2" />
      </FormSection>

      <FormSection flat={flat} icon={CalendarRangeIcon} title="Plan" description="Budget, target dates, and the project manager responsible.">
        <div className="flex min-w-0 flex-col">
          <TextField
            name="estimated_budget"
            label="Estimated project budget (USD)"
            inputMode="decimal"
            placeholder="e.g. 650,000"
            defaultValue={budgetDefault}
            error={fe.estimated_budget}
            hint="Optional. Planning figure only; it does not create or change an estimate."
            onBlur={(e) => {
              e.currentTarget.value = formatBudget(e.currentTarget.value)
            }}
          />
        </div>
        <SelectField
          name="project_manager_id"
          label="Project manager"
          options={[{ value: 'none', label: 'Unassigned' }, ...managerOptions]}
          defaultValue={v('project_manager_id', defaults.project_manager_id ?? 'none') || 'none'}
          error={fe.project_manager_id}
          hint={managerOptions.length ? undefined : 'No active admins or project managers in your company yet.'}
        />
        <div className="@container min-w-0 sm:col-span-2">
          <div className="grid gap-5 @xl:grid-cols-3">
            <TextField
              name="proposed_start_date"
              label="Proposed start"
              type="date"
              value={startDate}
              onChange={(e) => updateSchedule(e.currentTarget.value, businessDays)}
              error={fe.proposed_start_date}
            />
            <TextField
              name="planned_business_days"
              label="Business days"
              inputMode="numeric"
              autoComplete="off"
              placeholder="e.g. 55"
              value={businessDays}
              onChange={(e) => updateSchedule(startDate, e.currentTarget.value)}
              error={businessDaysError ?? fe.planned_business_days}
              hint="Mon–Fri · Start date counts as day 1."
            />
            <TextField
              name="target_completion_date"
              label="Target completion"
              type="date"
              min={startDate || undefined}
              value={targetDate}
              onChange={(e) => {
                setTargetDate(e.currentTarget.value)
                setBusinessDays('')
              }}
              error={fe.target_completion_date}
              hint={isCalculated ? 'Calculated automatically' : 'Must be on or after the proposed start.'}
            />
          </div>
        </div>
        <TextAreaField
          name="internal_notes"
          label="Internal notes"
          hint="Visible to builder staff only, never to homeowners."
          defaultValue={v('internal_notes', defaults.internal_notes)}
          error={fe.internal_notes}
          className="sm:col-span-2"
        />
      </FormSection>

      {scheduleSetup !== undefined && (
        <FormSection flat={flat}
          icon={ListChecksIcon}
          title="Construction schedule setup"
          description="Optional. Runs once after the project is saved, and you can change it later on the Schedule page."
        >
          {scheduleSetup ? (
            <>
              <fieldset className="flex min-w-0 flex-col gap-2 sm:col-span-2">
                <legend className="mb-2 text-sm font-medium text-foreground">Schedule</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    { value: 'standard', label: 'Use standard construction schedule', hint: 'Adds the standard B & J activities by phase.' },
                    { value: 'later', label: 'Configure later', hint: 'Start with an empty schedule.' },
                  ].map((opt) => (
                    <label
                      key={opt.value}
                      className={cn(
                        'flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border bg-background p-3 transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50',
                        scheduleMode === opt.value ? 'border-primary bg-sage/60' : 'border-input hover:border-primary/40',
                      )}
                    >
                      <input
                        type="radio"
                        name="schedule_setup"
                        value={opt.value}
                        checked={scheduleMode === opt.value}
                        onChange={() => setScheduleMode(opt.value)}
                        className="mt-0.5 size-4 accent-primary"
                      />
                      <span className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium text-foreground">{opt.label}</span>
                        <span className="text-xs leading-relaxed text-muted-foreground">{opt.hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <label
                className={cn(
                  'flex min-h-11 items-start gap-3 rounded-lg border border-input bg-background p-3 sm:col-span-2',
                  scheduleMode === 'standard' ? 'cursor-pointer' : 'cursor-not-allowed opacity-60',
                )}
              >
                <input
                  type="checkbox"
                  name="include_sprinkler"
                  defaultChecked={sv?.include_sprinkler === 'on'}
                  disabled={scheduleMode !== 'standard'}
                  className="mt-0.5 size-4 accent-primary"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-foreground">Include Sprinkler / Irrigation Installation</span>
                  <span className="text-xs leading-relaxed text-muted-foreground">
                    Lawn irrigation (not a fire-sprinkler system), added to the Exterior phase before Landscaping.
                  </span>
                </span>
              </label>
            </>
          ) : (
            <p className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground sm:col-span-2">
              <LockIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              The Schedule module is turned off for your company, so no schedule is created.
            </p>
          )}
        </FormSection>
      )}

      </SmartFormLayout>
    </form>
    {canCreateClient && (
      <CreateClientDialog
        open={clientDialogOpen}
        onOpenChange={setClientDialogOpen}
        finalFocus={clientSelectRef}
        onCreated={(client) => chooseClient({ value: client.id, label: client.label }, client.address)}
        onSelectExisting={(id, label) => chooseClient({ value: id, label })}
      />
    )}
    </>
  )
}
