'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { TextField } from '@/components/shared/form-field'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'
import { OverlayBody, OverlayFooter, useFormOverlay } from '@/components/shared/form-overlay'
import { ProjectRoleField, StartDateField } from '@/components/contacts/project-role-field'
import { TradeCombobox } from '@/components/subcontractors/trade-combobox'
import { assignProjectContactAction } from '@/app/actions/contacts'
import { createSubcontractorAction } from '@/app/actions/subcontractors'
import { OVERLAY_FIELD, initialActionState, type ActionState } from '@/lib/action-state'
import { segmentClass } from '@/lib/interaction-styles'
import { cn } from '@/lib/utils'

type Kind = 'contact' | 'company'

const TOUCH = 'pointer-coarse:min-h-11'
const FORM = 'flex min-h-0 flex-1 flex-col'

/** "Create new" side of the assignment drawer: a new contact or subcontractor company, added straight to the project. */
export function AssignCreateNew({
  projectId,
  projectName,
  canCreateCompany,
  onDraftingChange,
}: {
  projectId: string
  projectName: string
  canCreateCompany: boolean
  onDraftingChange: (drafting: boolean) => void
}) {
  const [kind, setKind] = useState<Kind>('contact')
  const [contactDraft, setContactDraft] = useState(false)
  const [companyDraft, setCompanyDraft] = useState(false)

  const drafting = contactDraft || companyDraft
  useEffect(() => {
    onDraftingChange(drafting)
  }, [drafting, onDraftingChange])

  return (
    <>
      {canCreateCompany && (
        <div className="shrink-0 px-5 pt-4 sm:px-6">
          <div role="group" aria-label="Record to create" className="grid grid-cols-2 gap-0.5 rounded-lg border border-border p-0.5">
            {(['contact', 'company'] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
                className={cn('min-h-9 rounded-md px-3 text-sm font-medium', TOUCH, segmentClass(kind === k))}
              >
                {k === 'contact' ? 'Contact' : 'Company'}
              </button>
            ))}
          </div>
        </div>
      )}
      {/* Both forms stay mounted so switching between them never drops what was typed. */}
      <div className={cn(FORM, kind !== 'contact' && 'hidden')}>
        <NewContactForm projectId={projectId} projectName={projectName} onDraft={setContactDraft} />
      </div>
      {canCreateCompany && (
        <div className={cn(FORM, kind !== 'company' && 'hidden')}>
          <NewCompanyForm projectId={projectId} projectName={projectName} onDraft={setCompanyDraft} />
        </div>
      )}
    </>
  )
}

/** Runs `onSaved` once per action result, no matter how often the surrounding callbacks change identity. */
function useSavedOnce(state: ActionState, saved: boolean, onSaved: () => void) {
  const handled = useRef<ActionState | null>(null)
  const latest = useRef(onSaved)
  latest.current = onSaved
  useEffect(() => {
    if (!saved || handled.current === state) return
    handled.current = state
    latest.current()
  }, [state, saved])
}

function NewContactForm({ projectId, projectName, onDraft }: { projectId: string; projectName: string; onDraft: (draft: boolean) => void }) {
  const router = useRouter()
  const overlay = useFormOverlay()
  const [state, formAction] = useActionState<ActionState, FormData>(assignProjectContactAction.bind(null, projectId), initialActionState)
  const v = state.values ?? {}
  const fe = state.fieldErrors ?? {}

  useSavedOnce(state, Boolean(state.success), () => {
    toast.success(state.success ?? 'Contact created and assigned to this project.')
    router.refresh()
    overlay?.forceClose()
  })

  return (
    // Remounting on a returned draft restores every field from the server's copy of what was typed.
    <form key={state.values ? JSON.stringify(state.values) : 'initial'} action={formAction} onChange={() => onDraft(true)} className={FORM}>
      <input type="hidden" name="mode" value="new" />
      <OverlayBody className="flex flex-col gap-4">
        <FormMessage state={state} />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField name="first_name" id="assign-new-first-name" label="First name" required autoComplete="off" defaultValue={v.first_name} error={fe.first_name} />
          <TextField name="last_name" id="assign-new-last-name" label="Last name" required autoComplete="off" defaultValue={v.last_name} error={fe.last_name} />
          <TextField name="email" id="assign-new-email" label="Email" type="email" inputMode="email" autoComplete="off" defaultValue={v.email} error={fe.email} />
          <TextField
            name="primary_phone"
            id="assign-new-phone"
            label="Phone"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            defaultValue={v.primary_phone}
            error={fe.primary_phone}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <ProjectRoleField defaultValue={v.project_role ?? ''} error={fe.project_role} />
          <StartDateField defaultValue={v.started_at} error={fe.started_at} />
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Saves the contact to your business directory and adds them to {projectName}. It does not create an account or grant portal access.
        </p>
      </OverlayBody>
      <OverlayFooter>
        <Button type="button" variant="outline" size="lg" className={TOUCH} onClick={overlay?.requestClose}>
          Cancel
        </Button>
        <SubmitButton className={TOUCH} pendingLabel="Saving…">
          Create and assign
        </SubmitButton>
      </OverlayFooter>
    </form>
  )
}

function NewCompanyForm({ projectId, projectName, onDraft }: { projectId: string; projectName: string; onDraft: (draft: boolean) => void }) {
  const router = useRouter()
  const overlay = useFormOverlay()
  const [state, formAction] = useActionState(createSubcontractorAction, initialActionState)
  const submittedName = useRef('')
  const v = state.values ?? {}
  const fe = state.fieldErrors ?? {}

  useSavedOnce(state, Boolean(state.savedId), () => {
    if (state.warning) toast.warning(state.warning)
    else toast.success(`${submittedName.current || 'The company'} was created and assigned to ${projectName}.`)
    router.refresh()
    overlay?.forceClose()
  })

  return (
    <form
      key={state.values ? JSON.stringify(state.values) : 'initial'}
      action={formAction}
      noValidate
      onChange={() => onDraft(true)}
      onSubmit={(e) => {
        submittedName.current = String(new FormData(e.currentTarget).get('company_name') ?? '').trim()
      }}
      className={FORM}
    >
      <input type="hidden" name={OVERLAY_FIELD} value="1" />
      <input type="hidden" name="status" value="active" />
      <input type="hidden" name="project_ids" value={projectId} />
      <OverlayBody className="flex flex-col gap-4">
        {!state.savedId && <FormMessage state={state} />}
        {fe.project_ids && (
          <p role="alert" className="text-sm text-destructive">
            {fe.project_ids}
          </p>
        )}
        <TextField
          name="company_name"
          id="assign-new-company-name"
          label="Company name"
          required
          autoComplete="organization"
          maxLength={160}
          defaultValue={v.company_name ?? ''}
          error={fe.company_name}
        />
        <TradeCombobox defaultValue={v.trade ?? ''} error={fe.trade} />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            name="email"
            id="assign-new-company-email"
            label="Company email"
            type="email"
            inputMode="email"
            maxLength={254}
            defaultValue={v.email ?? ''}
            error={fe.email}
          />
          <TextField
            name="phone"
            id="assign-new-company-phone"
            label="Main phone"
            type="tel"
            inputMode="tel"
            maxLength={30}
            defaultValue={v.phone ?? ''}
            error={fe.phone}
          />
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Saves the company to your subcontractor directory and assigns it to {projectName}. It does not invite anyone or grant portal access. Add
          contact persons, insurance, and qualification details later from the subcontractor profile.
        </p>
      </OverlayBody>
      <OverlayFooter>
        <Button type="button" variant="outline" size="lg" className={TOUCH} onClick={overlay?.requestClose}>
          Cancel
        </Button>
        <SubmitButton className={TOUCH} pendingLabel="Creating…">
          Create and assign
        </SubmitButton>
      </OverlayFooter>
    </form>
  )
}
