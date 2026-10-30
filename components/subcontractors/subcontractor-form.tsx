'use client'

import { useEffect, useState } from 'react'
import { useFormDirty } from '@/components/shared/smart-form'
import Link from 'next/link'
import {
  AlertCircle as AlertCircleIcon,
  Building2 as BuildingIcon,
  FolderKanban as FolderKanbanIcon,
  Phone as PhoneIcon,
  Users as UsersIcon,
  type LucideIcon,
} from 'lucide-react'
import { useActionState } from 'react'
import { ContactPersonsSection } from '@/components/subcontractors/contact-persons-section'
import type { SubcontractorFormData } from '@/lib/subcontractor-form-data'
import { Button } from '@/components/ui/button'
import { OVERLAY_FIELD, initialActionState, type ActionState } from '@/lib/action-state'
import { SUBCONTRACTOR_STATUS_LABELS, type SubcontractorStatus } from '@/lib/subcontractors'
import { TextField } from '@/components/shared/form-field'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'
import { OverlayBody, OverlayFooter, useFormOverlay } from '@/components/shared/form-overlay'
import { TradeCombobox } from '@/components/subcontractors/trade-combobox'
import { ProjectAssignmentsPicker } from '@/components/subcontractors/project-assignments-picker'
import { cn } from '@/lib/utils'

const DISCARD_PROMPT = 'You have unsaved changes. Discard them and leave this page?'

export function SubcontractorForm({
  action,
  cancelHref,
  onSaved,
  projects,
  projectAvailability,
  company,
  existingAssignments,
  people,
  contactsAvailability,
  currentContacts,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>
  cancelHref: string
  /** Drawer variant: called after a successful save instead of redirecting. */
  onSaved?: (result: ActionState) => void
} & SubcontractorFormData) {
  const overlay = useFormOverlay()
  const [state, formAction] = useActionState(action, initialActionState)
  const fe = state.fieldErrors ?? {}
  const v: Record<string, string> = state.values ?? {
    company_name: company?.company_name ?? '',
    trade: company?.trade ?? '',
    status: company?.status ?? 'active',
    email: company?.email ?? '',
    phone: company?.phone ?? '',
  }
  const isEdit = Boolean(company)
  const formKey = state.values ? JSON.stringify(state.values) : 'initial'
  const { formRef, dirty, check } = useFormDirty(formKey, overlay?.setDirty)

  useEffect(() => {
    if (!state.savedId) return
    onSaved?.(state)
    overlay?.forceClose()
  }, [state, onSaved, overlay])

  // Bring the first problem into view so errors far down a long form are never missed.
  useEffect(() => {
    if (!state.error) return
    const id = requestAnimationFrame(() => {
      const first = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], [role="alert"]')
      first?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      if (first?.matches('input, select, textarea')) first.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(id)
  }, [state, formRef])

  useEffect(() => {
    if (overlay || !dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [overlay, dirty])

  const sections = (
    <div className="flex flex-col">
      {overlay && <input type="hidden" name={OVERLAY_FIELD} value="1" />}

      <Section icon={BuildingIcon} title="Company information" description="The trade partner your team hires for project work.">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            name="company_name"
            label="Company name"
            required
            defaultValue={v.company_name ?? ''}
            error={fe.company_name}
            autoComplete="organization"
            autoFocus={!isEdit}
            maxLength={160}
            className="sm:col-span-2"
          />
          <TradeCombobox defaultValue={v.trade ?? ''} error={fe.trade} />
          <StatusToggle defaultValue={(v.status as SubcontractorStatus) ?? 'active'} error={fe.status} />
        </div>
      </Section>

      <Section icon={PhoneIcon} title="Company contact" description="The main office line and email. Both are optional.">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField name="email" label="Company email" type="email" inputMode="email" defaultValue={v.email ?? ''} error={fe.email} autoComplete="email" maxLength={254} placeholder="office@company.com" />
          <TextField name="phone" label="Main phone" type="tel" inputMode="tel" defaultValue={v.phone ?? ''} error={fe.phone} autoComplete="tel" maxLength={30} />
        </div>
      </Section>

      <Section
        icon={UsersIcon}
        title="Contact persons"
        description="People your team calls at this company. They are saved to your Contacts directory."
      >
        <ContactPersonsSection
          people={people}
          currentContacts={currentContacts}
          availability={contactsAvailability}
          savedValue={state.values ? (v.contact_persons ?? '') : undefined}
          errors={fe}
          onDirty={check}
        />
      </Section>

      <Section
        icon={FolderKanbanIcon}
        title="Project assignments"
        description={
          isEdit
            ? 'Add projects or end current assignments. Ended assignments stay in Project History.'
            : 'Optional. Choose the projects this company will work on. You can change this later.'
        }
      >
        <ProjectAssignmentsPicker
          projects={projects}
          availability={projectAvailability}
          defaultValue={v.project_ids ?? ''}
          error={fe.project_ids}
          existing={existingAssignments}
        />
      </Section>
    </div>
  )

  const submit = (
    <SubmitButton size="lg" pendingLabel={isEdit ? 'Saving changes…' : 'Saving subcontractor…'}>
      {isEdit ? 'Save changes' : 'Save subcontractor'}
    </SubmitButton>
  )
  const message = !state.savedId ? <FormMessage state={state} /> : null
  const formProps = {
    ref: formRef,
    action: formAction,
    noValidate: true,
    onInput: check,
    onChange: check,
    // Events from portaled combobox popups bubble through the React tree, so option clicks land here too.
    onClick: check,
    onKeyUp: check,
  }

  if (overlay) {
    return (
      <form key={formKey} {...formProps} className="flex min-h-0 flex-1 flex-col">
        <OverlayBody className="py-2">{sections}</OverlayBody>
        <OverlayFooter message={message}>
          <p className="mr-auto hidden text-xs text-muted-foreground sm:block">
            {dirty ? 'Unsaved changes' : 'Fields marked * are required.'}
          </p>
          <Button type="button" variant="outline" size="lg" onClick={overlay.requestClose}>
            Cancel
          </Button>
          {submit}
        </OverlayFooter>
      </form>
    )
  }

  return (
    <form key={formKey} {...formProps} className="flex flex-col gap-4">
      <div className="rounded-xl border border-border/80 bg-card px-5 py-2 shadow-xs sm:px-7">{sections}</div>
      <div className="sticky bottom-0 z-10 -mx-1 flex flex-col gap-3 rounded-xl border border-border/80 bg-card/95 p-4 shadow-sm backdrop-blur supports-backdrop-filter:bg-card/85 sm:p-4">
        {message}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          <p className="mr-auto hidden text-xs text-muted-foreground sm:block">
            {dirty ? 'Unsaved changes' : 'Fields marked * are required.'}
          </p>
          <Button
            variant="outline"
            size="lg"
            render={
              <Link
                href={cancelHref}
                onClick={(e) => {
                  if (dirty && !window.confirm(DISCARD_PROMPT)) e.preventDefault()
                }}
              />
            }
            nativeButton={false}
          >
            Cancel
          </Button>
          {submit}
        </div>
      </div>
    </form>
  )
}

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-4 border-b border-border/60 py-6 last:border-b-0">
      <header className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sage text-primary ring-1 ring-inset ring-primary/10">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="text-sm leading-relaxed text-pretty text-muted-foreground">{description}</p>
        </div>
      </header>
      {children}
    </section>
  )
}

function StatusToggle({ defaultValue, error }: { defaultValue: SubcontractorStatus; error?: string }) {
  const [value, setValue] = useState<SubcontractorStatus>(defaultValue === 'inactive' ? 'inactive' : 'active')
  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5" aria-describedby="status-hint">
      <legend className="mb-1.5 text-sm leading-none font-medium text-foreground">Status</legend>
      <div className="grid h-10 grid-cols-2 gap-1 rounded-lg border border-input bg-muted/40 p-1">
        {(Object.entries(SUBCONTRACTOR_STATUS_LABELS) as [SubcontractorStatus, string][]).map(([key, label]) => (
          <label
            key={key}
            className={cn(
              'flex cursor-pointer items-center justify-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50',
              value === key && 'bg-background text-foreground shadow-xs ring-1 ring-border',
            )}
          >
            <input type="radio" name="status" value={key} checked={value === key} onChange={() => setValue(key)} className="sr-only" />
            <span aria-hidden="true" className={cn('size-1.5 rounded-full', key === 'active' ? 'bg-primary' : 'bg-muted-foreground/60')} />
            {label}
          </label>
        ))}
      </div>
      {error ? (
        <p className="flex items-start gap-1.5 text-xs text-destructive">
          <AlertCircleIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : (
        <p id="status-hint" className="text-xs leading-relaxed text-muted-foreground">
          {value === 'active' ? 'Can be assigned to new projects and work.' : 'Kept for history. Cannot receive new work.'}
        </p>
      )}
    </fieldset>
  )
}
