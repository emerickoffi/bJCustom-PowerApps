'use client'

import {
  UserRound as UserRoundIcon,
  Phone as PhoneIcon,
  MapPin as MapPinIcon,
  ClipboardList as ClipboardListIcon,
  Folder as FolderIcon,
  CircleCheck as CircleCheckIcon,
} from 'lucide-react'
import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { OVERLAY_FIELD, initialActionState, type ActionState } from '@/lib/action-state'
import { CLIENT_STATUS_LABELS, COMMUNICATION_LABELS } from '@/lib/domain'
import type { ClientOption } from '@/lib/client-options'
import { cn } from '@/lib/utils'
import { FormSection, SelectField, TextAreaField, TextField } from '@/components/shared/form-field'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'
import { AdditionalContactsSection } from '@/components/clients/additional-contacts-section'
import { SmartFormLayout, useSmartForm } from '@/components/shared/smart-form'
import { useFormOverlay } from '@/components/shared/form-overlay'
import { ProjectForm, type ClientMailingAddress } from '@/components/projects/project-form'
import { createProjectAction } from '@/app/actions/projects'

type SavedClient = { id: string; label: string; detail?: string; address: ClientMailingAddress }
type ClientFormState = ActionState & { client?: SavedClient }

/** What the New Project form needs, loaded by the page so the drawer can continue without a reload. */
export type ClientProjectSetup = {
  orgId: string
  clientOptions: ClientOption[]
  clientAddresses: Record<string, ClientMailingAddress>
  managerOptions: { value: string; label: string }[]
  scheduleSetup: boolean
}

type ProjectChoice = 'later' | 'existing' | 'new'

export type ClientFormValues = {
  first_name?: string
  middle_name?: string | null
  last_name?: string
  company_name?: string | null
  email?: string | null
  phone?: string | null
  alternate_phone?: string | null
  address_line1?: string | null
  address_line2?: string | null
  city?: string | null
  state?: string | null
  postal_code?: string | null
  country?: string | null
  preferred_communication?: string
  status?: string
  notes?: string | null
}

export function ClientForm({
  action,
  defaults: initialDefaults = {},
  submitLabel,
  pendingLabel,
  cancelHref,
  additionalContacts = false,
  projectOptions,
  projectSetup,
  onSaved,
}: {
  /** Drawer over a list: called after a successful save instead of following the action's redirect. */
  onSaved?: (result: ActionState) => void
  pendingLabel?: string
  action: (state: ClientFormState, formData: FormData) => Promise<ClientFormState>
  defaults?: ClientFormValues
  submitLabel: string
  cancelHref: string
  additionalContacts?: boolean
  /** Unassigned projects the new client can become the primary homeowner of. */
  projectOptions?: { value: string; label: string }[]
  /** Enables “Create new project”, which continues to project setup after the client saves. */
  projectSetup?: ClientProjectSetup
}) {
  const [state, formAction] = useActionState<ClientFormState, FormData>(action, initialActionState)
  const [choice, setChoice] = useState<ProjectChoice>(() => {
    const v = state.values?.project_choice
    return v === 'existing' || v === 'new' ? v : 'later'
  })
  const fe = state.fieldErrors ?? {}
  const defaults: ClientFormValues = { ...initialDefaults, ...state.values }
  const formKey = state.values ? JSON.stringify(state.values) : 'initial'
  const { overlay, inOverlay: flat, dirty, formProps } = useSmartForm(state, formKey)
  const setOverlayDirty = overlay?.setDirty

  useEffect(() => {
    if (!state.savedId) return
    // The saved values are no longer a draft, so the overlay must not ask about discarding them next time.
    setOverlayDirty?.(false)
    onSaved?.(state)
  }, [state, onSaved, setOverlayDirty])

  // Once saved, the client form is replaced, so it can never be submitted (and the client created) twice.
  if (state.client && projectSetup) {
    return <ProjectSetupStep client={state.client} setup={projectSetup} warning={state.warning} />
  }

  const continuing = choice === 'new' && Boolean(projectSetup)
  const hasEligible = Boolean(projectOptions?.length)
  const choices: { value: ProjectChoice; label: string; hint: string; disabled?: boolean }[] = [
    { value: 'later', label: 'Add project later', hint: 'Save the client now and add a project from their page.' },
    {
      value: 'existing',
      label: 'Assign to existing project',
      hint: hasEligible ? 'Make this client the primary homeowner of a project that has none.' : 'No projects available to assign',
      disabled: !hasEligible,
    },
    ...(projectSetup
      ? [{ value: 'new' as const, label: 'Create new project', hint: 'Save this client and continue to project setup.' }]
      : []),
  ]

  return (
    <form key={formKey} action={formAction} {...formProps}>
      {onSaved && <input type="hidden" name={OVERLAY_FIELD} value="1" />}
      <SmartFormLayout
        dirty={dirty}
        cancelHref={cancelHref}
        message={<FormMessage state={state} />}
        submit={
          <SubmitButton pendingLabel={continuing ? 'Saving client…' : pendingLabel}>
            {continuing ? 'Create client & continue' : submitLabel}
          </SubmitButton>
        }
      >
        <ClientFormFields
          defaults={defaults}
          fieldErrors={fe}
          flat={flat}
          additionalContacts={additionalContacts ? { values: state.values } : undefined}
        />
        {projectOptions && (
          <FormSection
            flat={flat}
            icon={FolderIcon}
            title="Project"
            description="Link this client to a project now, or add one later."
          >
            <fieldset className="flex min-w-0 flex-col gap-2 sm:col-span-2">
              <legend className="sr-only">Project for this client</legend>
              <div className="grid gap-3">
                {choices.map((opt) => (
                  <label
                    key={opt.value}
                    className={cn(
                      'flex min-h-11 items-start gap-3 rounded-lg border bg-background p-3 transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50',
                      opt.disabled
                        ? 'cursor-not-allowed border-input opacity-70'
                        : choice === opt.value
                          ? 'cursor-pointer border-primary bg-sage/60'
                          : 'cursor-pointer border-input hover:border-primary/40',
                    )}
                  >
                    <input
                      type="radio"
                      name="project_choice"
                      value={opt.value}
                      checked={choice === opt.value}
                      disabled={opt.disabled}
                      onChange={() => setChoice(opt.value)}
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
            {choice === 'existing' && hasEligible && (
              <SelectField
                name="assign_project_id"
                label="Select a project"
                required
                placeholder="Select a project"
                defaultValue={state.values?.assign_project_id ?? ''}
                error={fe.assign_project_id}
                options={projectOptions}
                hint="Only projects without a primary homeowner are listed."
                className="sm:col-span-2"
              />
            )}
          </FormSection>
        )}
      </SmartFormLayout>
    </form>
  )
}

/**
 * Second step of “Create new project”: the existing New Project form, in the same drawer, with the
 * saved client as primary homeowner. Closing here keeps the client and opens their page.
 */
function ProjectSetupStep({ client, setup, warning }: { client: SavedClient; setup: ClientProjectSetup; warning?: string }) {
  const overlay = useFormOverlay()
  const router = useRouter()
  const laterHref = `/clients/${client.id}?notice=project_later`
  const setOverride = overlay?.setOverride
  const setDirty = overlay?.setDirty

  useEffect(() => {
    // The client form's unsaved state no longer applies; it is saved.
    setDirty?.(false)
    setOverride?.({
      title: 'New project',
      description: `${client.label} is saved. Set up their project, or close to add one later.`,
      onClose: () => router.replace(laterHref),
    })
    return () => setOverride?.(null)
  }, [setOverride, setDirty, router, laterHref, client.label])

  const hasAddress = Object.values(client.address).some(Boolean)
  const clientOptions = setup.clientOptions.some((o) => o.value === client.id)
    ? setup.clientOptions
    : [{ value: client.id, label: client.label, detail: client.detail }, ...setup.clientOptions]

  return (
    <>
      <div
        role="status"
        className={cn(
          overlay ? 'mx-5 mt-4 sm:mx-6' : 'mb-5',
          'flex shrink-0 items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3.5 py-2.5 text-sm text-foreground',
        )}
      >
        <CircleCheckIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <p className="leading-relaxed">
          <span className="font-medium">{client.label}</span> was saved as a client. If you cancel, they stay in your client
          list and you can add a project from their page later.
          {warning && <span className="mt-1 block text-destructive">{warning}</span>}
        </p>
      </div>
      <ProjectForm
        action={createProjectAction}
        defaults={{ primary_client_id: client.id }}
        clientOptions={clientOptions}
        clientAddresses={hasAddress ? { ...setup.clientAddresses, [client.id]: client.address } : setup.clientAddresses}
        managerOptions={setup.managerOptions}
        scheduleSetup={setup.scheduleSetup}
        cover={{ orgId: setup.orgId }}
        submitLabel="Create project"
        pendingLabel="Creating project…"
        cancelHref={laterHref}
      />
    </>
  )
}

/**
 * The client record fields, shared by the client pages and the inline "Create new client" dialog.
 * `idPrefix` keeps element ids unique when these fields render next to another form.
 */
export function ClientFormFields({
  defaults,
  fieldErrors: fe,
  flat,
  idPrefix,
  additionalContacts,
}: {
  defaults: ClientFormValues
  fieldErrors: Record<string, string>
  flat?: boolean
  idPrefix?: string
  additionalContacts?: { values?: Record<string, string> }
}) {
  const d = (v: string | null | undefined) => v ?? ''
  const id = (name: string) => (idPrefix ? `${idPrefix}${name}` : undefined)

  return (
    <>
      <FormSection flat={flat} icon={UserRoundIcon} title="Homeowner information" description="The primary person this client record represents.">
        <TextField id={id('first_name')} name="first_name" label="First name" required defaultValue={d(defaults.first_name)} error={fe.first_name} autoComplete="off" />
        <TextField id={id('middle_name')} name="middle_name" label="Middle name" defaultValue={d(defaults.middle_name)} error={fe.middle_name} autoComplete="off" />
        <TextField id={id('last_name')} name="last_name" label="Last name" required defaultValue={d(defaults.last_name)} error={fe.last_name} autoComplete="off" />
        <TextField id={id('company_name')} name="company_name" label="Company or trust" defaultValue={d(defaults.company_name)} error={fe.company_name} hint="Optional, if the home is owned by an entity." />
      </FormSection>

      <FormSection flat={flat} icon={PhoneIcon} title="Contact details" description="How your team reaches this homeowner.">
        <TextField id={id('email')} name="email" label="Email" type="email" defaultValue={d(defaults.email)} error={fe.email} hint="Required to invite them to the homeowner portal." />
        <SelectField
          id={id('preferred_communication')}
          name="preferred_communication"
          label="Preferred contact"
          defaultValue={defaults.preferred_communication ?? 'email'}
          options={Object.entries(COMMUNICATION_LABELS).map(([value, label]) => ({ value, label }))}
        />
        <TextField id={id('phone')} name="phone" label="Phone" type="tel" defaultValue={d(defaults.phone)} error={fe.phone} />
        <TextField id={id('alternate_phone')} name="alternate_phone" label="Alternate phone" type="tel" defaultValue={d(defaults.alternate_phone)} error={fe.alternate_phone} />
      </FormSection>

      <FormSection flat={flat} icon={MapPinIcon} title="Mailing address" description="Where the homeowner currently lives, not the build site.">
        <TextField id={id('address_line1')} name="address_line1" label="Street address" defaultValue={d(defaults.address_line1)} error={fe.address_line1} className="sm:col-span-2" />
        <TextField id={id('address_line2')} name="address_line2" label="Apt, suite, etc." defaultValue={d(defaults.address_line2)} error={fe.address_line2} className="sm:col-span-2" />
        <TextField id={id('city')} name="city" label="City" defaultValue={d(defaults.city)} error={fe.city} />
        <TextField id={id('state')} name="state" label="State" defaultValue={d(defaults.state)} error={fe.state} />
        <TextField id={id('postal_code')} name="postal_code" label="ZIP code" defaultValue={d(defaults.postal_code)} error={fe.postal_code} />
        <TextField id={id('country')} name="country" label="Country" defaultValue={defaults.country ?? 'United States'} error={fe.country} />
      </FormSection>

      {additionalContacts && <AdditionalContactsSection values={additionalContacts.values} fieldErrors={fe} flat={flat} />}

      <FormSection flat={flat} icon={ClipboardListIcon} title="Internal notes & record" description="Status and internal notes are only visible to your team.">
        <SelectField
          id={id('status')}
          name="status"
          label="Client status"
          defaultValue={defaults.status ?? 'active'}
          options={Object.entries(CLIENT_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
        />
        <div className="hidden sm:block" />
        <TextAreaField id={id('notes')} name="notes" label="Internal notes" defaultValue={d(defaults.notes)} error={fe.notes} className="sm:col-span-2" />
      </FormSection>
    </>
  )
}
