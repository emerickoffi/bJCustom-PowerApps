'use client'

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { AlertTriangle, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { NativeSelect, TextField } from '@/components/shared/form-field'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'
import { initialActionState } from '@/lib/action-state'
import { addProjectAdditionalContactAction, reuseContactOnProjectAction } from '@/app/actions/project-homeowners'
import { additionalContactRelationshipOptions, findPossibleDuplicates } from '@/lib/project-homeowners'
import { CONTACT_RELATIONSHIP_LABELS } from '@/lib/domain'
import type { ExistingClientContact } from '@/lib/project-homeowners-data'

const EMPTY = {
  first_name: '',
  middle_name: '',
  last_name: '',
  relationship: '',
  email: '',
  phone: '',
  alternate_phone: '',
  preferred_communication: 'email',
}
type Fields = typeof EMPTY

const COMMUNICATION_OPTIONS = [
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone call' },
  { value: 'text', label: 'Text message' },
  { value: 'any', label: 'No preference' },
]

const REASON_LABEL = { email: 'same email', phone: 'same phone', name: 'same name' } as const

export function AddAdditionalContactDialog({
  projectId,
  homeownerName,
  existingContacts,
  scopingAvailable,
}: {
  projectId: string
  homeownerName: string
  existingContacts: ExistingClientContact[]
  scopingAvailable: boolean
}) {
  const [open, setOpen] = useState(false)
  const [fields, setFields] = useState<Fields>(EMPTY)
  const [projectOnly, setProjectOnly] = useState(false)
  const [confirmNew, setConfirmNew] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [reuseError, setReuseError] = useState<string | null>(null)
  const [reusing, startReuse] = useTransition()
  const [state, formAction, saving] = useActionState(
    addProjectAdditionalContactAction.bind(null, projectId),
    initialActionState,
  )
  const handledState = useRef(state)

  const dirty = (Object.keys(EMPTY) as (keyof Fields)[]).some((k) => fields[k] !== EMPTY[k]) || projectOnly
  const busy = saving || reusing

  const matches = useMemo(
    () =>
      fields.first_name || fields.email || fields.phone || fields.alternate_phone
        ? findPossibleDuplicates(fields, existingContacts)
        : [],
    [fields, existingContacts],
  )

  function reset() {
    setFields(EMPTY)
    setProjectOnly(false)
    setConfirmNew(false)
    setConfirmDiscard(false)
    setReuseError(null)
  }

  function close() {
    setOpen(false)
    reset()
  }

  useEffect(() => {
    if (state === handledState.current) return
    handledState.current = state
    if (state.savedId) {
      toast.success(state.success ?? 'Contact added.')
      close()
    }
  }, [state])

  function requestOpenChange(next: boolean) {
    if (next) return setOpen(true)
    if (busy) return
    if (dirty) return setConfirmDiscard(true)
    close()
  }

  function reuse(contactId: string) {
    setReuseError(null)
    startReuse(async () => {
      try {
        const result = await reuseContactOnProjectAction(projectId, contactId)
        if (result.error) return setReuseError(result.error)
        toast.success(result.success ?? 'Contact added to this project.')
        close()
      } catch {
        setReuseError('Something went wrong. Nothing was changed. Please try again.')
      }
    })
  }

  const set = (key: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFields((f) => ({ ...f, [key]: e.target.value }))
    setConfirmNew(false)
  }
  const fieldErrors = state.fieldErrors ?? {}
  const serverFlaggedDuplicate = fieldErrors._duplicate === 'true'
  const needsConfirm = matches.length > 0 || serverFlaggedDuplicate

  return (
    <Dialog open={open} onOpenChange={requestOpenChange}>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <UserPlus className="size-3.5" aria-hidden="true" />
        Add additional contact
      </Button>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg">Add additional contact</DialogTitle>
          <DialogDescription>
            {'Adds a person to '}
            <span className="font-medium text-foreground">{homeownerName}</span>
            {'. No portal access is granted — use Manage access when needed.'}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4 sm:grid-cols-2" noValidate>
          <TextField name="first_name" label="First name" required value={fields.first_name} onChange={set('first_name')} error={fieldErrors.first_name} autoComplete="off" />
          <TextField name="last_name" label="Last name" required value={fields.last_name} onChange={set('last_name')} error={fieldErrors.last_name} autoComplete="off" />
          <TextField name="middle_name" label="Middle name" value={fields.middle_name} onChange={set('middle_name')} error={fieldErrors.middle_name} autoComplete="off" />
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="relationship" className="text-sm font-medium">
              Relationship
              <span className="text-destructive" aria-hidden="true">*</span>
              <span className="sr-only">(required)</span>
            </Label>
            <NativeSelect
              id="relationship"
              name="relationship"
              required
              value={fields.relationship}
              onChange={set('relationship')}
              aria-invalid={fieldErrors.relationship ? true : undefined}
            >
              <option value="" disabled>
                Select relationship
              </option>
              {additionalContactRelationshipOptions().map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
            {fieldErrors.relationship && <p className="text-xs text-destructive">{fieldErrors.relationship}</p>}
          </div>
          <TextField name="email" label="Email" type="email" className="sm:col-span-2" value={fields.email} onChange={set('email')} error={fieldErrors.email} autoComplete="off" />
          <TextField name="phone" label="Primary phone" type="tel" value={fields.phone} onChange={set('phone')} error={fieldErrors.phone} autoComplete="off" />
          <TextField name="alternate_phone" label="Secondary phone" type="tel" value={fields.alternate_phone} onChange={set('alternate_phone')} error={fieldErrors.alternate_phone} autoComplete="off" />
          <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="preferred_communication" className="text-sm font-medium">
              Preferred communication
            </Label>
            <NativeSelect
              id="preferred_communication"
              name="preferred_communication"
              value={fields.preferred_communication}
              onChange={set('preferred_communication')}
            >
              {COMMUNICATION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </div>

          {scopingAvailable && (
            <label className="flex items-start gap-2.5 rounded-lg border bg-[#F8F7F3] p-3 text-sm sm:col-span-2">
              <input
                type="checkbox"
                name="project_only"
                checked={projectOnly}
                onChange={(e) => setProjectOnly(e.target.checked)}
                className="mt-0.5 size-4 accent-primary"
              />
              <span className="flex flex-col gap-0.5">
                <span className="font-medium text-foreground">This project only</span>
                <span className="text-xs text-muted-foreground">
                  {"Leave unchecked to show this person on all of the homeowner's projects."}
                </span>
              </span>
            </label>
          )}

          {needsConfirm && (
            <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 sm:col-span-2" role="status">
              <p className="flex items-center gap-2 text-sm font-medium text-amber-900">
                <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
                Possible existing contact
              </p>
              {matches.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {matches.map(({ contact, reasons }) => (
                    <li key={contact.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white px-3 py-2">
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium text-foreground">
                          {contact.first_name} {contact.last_name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {CONTACT_RELATIONSHIP_LABELS[contact.relationship] ?? contact.relationship}
                          {' · '}
                          {reasons.map((r) => REASON_LABEL[r]).join(', ')}
                        </span>
                      </span>
                      {contact.visibleHere ? (
                        <span className="text-xs text-muted-foreground">Already on this project</span>
                      ) : contact.archived ? (
                        <span className="text-xs text-muted-foreground">Archived</span>
                      ) : (
                        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => reuse(contact.id)}>
                          {reusing ? 'Adding...' : 'Use this contact'}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <label className="flex items-center gap-2 text-sm text-amber-900">
                <input
                  type="checkbox"
                  checked={confirmNew}
                  onChange={(e) => setConfirmNew(e.target.checked)}
                  className="size-4 accent-primary"
                />
                This is a different person — create a new contact
              </label>
              {reuseError && <p className="text-sm text-destructive">{reuseError}</p>}
            </div>
          )}
          <input type="hidden" name="confirm_new" value={confirmNew ? 'true' : 'false'} />

          {!state.savedId && state.error && !serverFlaggedDuplicate && (
            <div className="sm:col-span-2">
              <FormMessage state={state} />
            </div>
          )}

          {confirmDiscard ? (
            <div className="flex flex-col gap-3 rounded-lg border bg-[#F8F7F3] p-3 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between" role="alert">
              <span className="text-sm text-foreground">Discard the details you entered?</span>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDiscard(false)}>
                  Keep editing
                </Button>
                <Button type="button" variant="destructive" size="sm" onClick={close}>
                  Discard
                </Button>
              </div>
            </div>
          ) : (
            <div className="-mx-4 -mb-4 flex flex-col-reverse gap-2 border-t bg-muted/50 p-4 sm:col-span-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" disabled={busy} onClick={() => requestOpenChange(false)}>
                Cancel
              </Button>
              <SubmitButton pendingLabel="Saving..." disabled={busy || (needsConfirm && !confirmNew)}>
                Save contact
              </SubmitButton>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  )
}
