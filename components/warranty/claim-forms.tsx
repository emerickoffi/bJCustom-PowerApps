'use client'

import { startTransition, useActionState, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { initialActionState, type ActionState } from '@/lib/action-state'
import { homeownerClaimAction, staffClaimAction, submitClaimAction } from '@/app/actions/warranty-claims'
import { ClaimAttachments, useClaimAttachments, type ClaimAttachmentsController } from '@/components/warranty/claim-attachments'
import { CoverageTag } from '@/components/warranty/coverage-accent'

export type CoverageOption = { coverage_key: string; name: string; categories: string[]; ended: boolean }
export type StaffOption = { id: string; name: string }

const selectClass =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50'

function Message({ state }: { state: ActionState }) {
  if (state.error) return <p role="alert" className="text-sm text-destructive">{state.error}</p>
  if (state.warning) return <p role="alert" className="rounded-md bg-muted px-3 py-2 text-sm text-foreground">{state.warning}</p>
  if (state.success) return <p role="status" className="text-sm text-primary">{state.success}</p>
  return null
}

/** Submits a form with its attachment list, bypassing native form reset so typed values and selections survive errors. */
function submitWithAttachments(
  event: FormEvent<HTMLFormElement>,
  attachments: ClaimAttachmentsController,
  dispatch: (formData: FormData) => void,
  pending: boolean,
  extra?: Record<string, string>,
) {
  event.preventDefault()
  if (pending) return
  const formData = new FormData(event.currentTarget)
  for (const [k, v] of Object.entries(extra ?? {})) formData.set(k, v)
  attachments.appendTo(formData)
  startTransition(() => dispatch(formData))
}

/** Increments each time the action reports full success, so callers can key a fresh draft off it. */
function useSuccessVersion(state: ActionState) {
  const [seen, setSeen] = useState(state)
  const [version, setVersion] = useState(0)
  if (state !== seen) {
    setSeen(state)
    if (state.success) setVersion((v) => v + 1)
  }
  return version
}

function pendingLabel(base: string, count: number) {
  return count ? `${base} and uploading ${count} ${count === 1 ? 'attachment' : 'attachments'}...` : `${base}...`
}

function FieldError({ state, name }: { state: ActionState; name: string }) {
  const message = state.fieldErrors?.[name]
  return message ? <p className="text-xs text-destructive">{message}</p> : null
}

export function SubmitClaimForm({ projectId, coverages }: { projectId: string; coverages: CoverageOption[] }) {
  const [state, action, pending] = useActionState(submitClaimAction, initialActionState)
  // A fresh draft (new submission key, empty attachments) only after a fully successful submission.
  const version = useSuccessVersion(state)
  return (
    <ClaimDraft
      key={version}
      projectId={projectId}
      coverages={coverages}
      state={state}
      action={action}
      pending={pending}
    />
  )
}

function ClaimDraft({
  projectId,
  coverages,
  state,
  action,
  pending,
}: {
  projectId: string
  coverages: CoverageOption[]
  state: ActionState
  action: (formData: FormData) => void
  pending: boolean
}) {
  const [submissionKey] = useState(() => crypto.randomUUID())
  const attachments = useClaimAttachments()
  const [coverageKey, setCoverageKey] = useState(state.values?.coverage_key ?? coverages.find((c) => !c.ended)?.coverage_key ?? '')
  const coverage = coverages.find((c) => c.coverage_key === coverageKey)
  const categories = coverage ? [...coverage.categories, 'Other'] : []
  const savedPartially = Boolean(state.warning && state.savedId)

  return (
    <form
      onSubmit={(e) => submitWithAttachments(e, attachments, action, pending, { submission_key: submissionKey })}
      className="flex flex-col gap-4"
      aria-busy={pending}
    >
      <input type="hidden" name="project_id" value={projectId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="coverage_key">Coverage period</Label>
          <select
            id="coverage_key"
            name="coverage_key"
            required
            className={selectClass}
            value={coverageKey}
            onChange={(e) => setCoverageKey(e.target.value)}
          >
            <option value="" disabled>
              Choose a coverage period
            </option>
            {coverages.map((c) => (
              <option key={c.coverage_key} value={c.coverage_key}>
                {c.name}
                {c.ended ? ' (period ended)' : ''}
              </option>
            ))}
          </select>
          {coverage && <CoverageTag coverageKey={coverage.coverage_key} name={coverage.name} className="text-xs" />}
          <FieldError state={state} name="coverage_key" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="category">Category</Label>
          <select
            id="category"
            name="category"
            required
            className={selectClass}
            defaultValue={state.values?.category ?? ''}
            disabled={!coverage}
            key={coverageKey}
          >
            <option value="" disabled>
              Choose a category
            </option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <FieldError state={state} name="category" />
        </div>
      </div>
      {coverage?.ended && (
        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          This coverage period has ended. You can still submit, and your builder will review whether it is covered.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="title">Short title</Label>
          <Input id="title" name="title" required minLength={3} maxLength={160} defaultValue={state.values?.title} placeholder="Leak under kitchen sink" />
          <FieldError state={state} name="title" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="location">Location in the home</Label>
          <Input id="location" name="location" required minLength={2} maxLength={200} defaultValue={state.values?.location} placeholder="Kitchen" />
          <FieldError state={state} name="location" />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">What are you seeing?</Label>
        <Textarea id="description" name="description" required minLength={10} maxLength={5000} rows={4} defaultValue={state.values?.description} />
        <FieldError state={state} name="description" />
      </div>
      <ClaimAttachments controller={attachments} disabled={pending} idPrefix="claim" />
      <p className="text-xs text-muted-foreground">
        Once submitted, your original description and attachments are kept as a permanent record and cannot be edited.
      </p>
      <Message state={state} />
      <Button type="submit" disabled={pending} className="w-fit">
        {pending
          ? pendingLabel(savedPartially ? 'Retrying' : 'Submitting', attachments.items.length)
          : savedPartially
            ? 'Retry attaching files'
            : 'Submit warranty claim'}
      </Button>
    </form>
  )
}

type StaffActionConfig = {
  action: string
  label: string
  variant?: 'default' | 'outline' | 'destructive'
  note?: { label: string; required: boolean }
  corrective?: boolean
  photos?: boolean
}

function staffActionsFor(status: string, homeownerValidation: string, isManager: boolean): StaffActionConfig[] {
  const decisions: StaffActionConfig[] = isManager
    ? [
        { action: 'accept', label: 'Accept as covered', note: { label: 'Decision note (shared with homeowner)', required: false } },
        { action: 'not_covered', label: 'Not covered', variant: 'outline', note: { label: 'Reason (shared with homeowner)', required: true } },
      ]
    : []
  switch (status) {
    case 'submitted':
      return [
        { action: 'start_review', label: 'Start review', variant: 'outline' },
        { action: 'request_info', label: 'Request information', variant: 'outline', note: { label: 'What do you need?', required: true } },
        ...decisions,
      ]
    case 'under_review':
      return [
        { action: 'request_info', label: 'Request information', variant: 'outline', note: { label: 'What do you need?', required: true } },
        ...decisions,
      ]
    case 'info_requested':
      return isManager ? decisions.filter((d) => d.action === 'not_covered') : []
    case 'accepted':
      return [{ action: 'start_work', label: 'Start repair' }]
    case 'in_progress':
      return [
        { action: 'update_corrective', label: 'Save work notes', variant: 'outline', corrective: true, photos: true },
        { action: 'ready_for_validation', label: 'Send to homeowner for review', corrective: true, photos: true },
      ]
    case 'ready_for_validation':
      return homeownerValidation === 'accepted' && isManager ? [{ action: 'close', label: 'Close claim' }] : []
    case 'not_covered':
      return isManager ? [{ action: 'close', label: 'Close claim' }] : []
    default:
      return []
  }
}

function StaffActionForm({ claimId, projectId, config, onDone }: { claimId: string; projectId: string; config: StaffActionConfig; onDone: () => void }) {
  const [state, action, pending] = useActionState(staffClaimAction, initialActionState)
  const version = useSuccessVersion(state)
  const attachments = useClaimAttachments(version)
  return (
    <form
      key={version}
      onSubmit={(e) => submitWithAttachments(e, attachments, action, pending)}
      className="flex flex-col gap-3 rounded-lg border p-4"
      aria-busy={pending}
    >
      <input type="hidden" name="claim_id" value={claimId} />
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="action" value={config.action} />
      {config.note && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`note-${claimId}`}>{config.note.label}</Label>
          <Textarea id={`note-${claimId}`} name="note" rows={2} maxLength={2000} required={config.note.required} />
        </div>
      )}
      {config.corrective && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`corrective-${claimId}`}>Corrective work performed</Label>
          <Textarea id={`corrective-${claimId}`} name="corrective" rows={3} maxLength={5000} required />
        </div>
      )}
      {config.photos && (
        <ClaimAttachments
          controller={attachments}
          disabled={pending}
          idPrefix={`repair-${claimId}`}
          label="Repair photos & documents (optional)"
        />
      )}
      <Message state={state} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={pending} variant={config.variant === 'outline' ? 'outline' : 'default'}>
          {pending ? pendingLabel('Saving', config.photos ? attachments.items.length : 0) : config.label}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

function QuickStaffAction({ claimId, projectId, config }: { claimId: string; projectId: string; config: StaffActionConfig }) {
  const [state, action, pending] = useActionState(staffClaimAction, initialActionState)
  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="claim_id" value={claimId} />
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="action" value={config.action} />
      <Button type="submit" size="sm" disabled={pending} variant={config.variant === 'outline' ? 'outline' : 'default'}>
        {pending ? 'Saving...' : config.label}
      </Button>
      {state.error && <p role="alert" className="text-xs text-destructive">{state.error}</p>}
    </form>
  )
}

export function StaffClaimControls({
  claimId,
  projectId,
  status,
  homeownerValidation,
  isManager,
  assignedTo,
  staff,
}: {
  claimId: string
  projectId: string
  status: string
  homeownerValidation: string
  isManager: boolean
  assignedTo: string | null
  staff: StaffOption[]
}) {
  const [open, setOpen] = useState<string | null>(null)
  const actions = staffActionsFor(status, homeownerValidation, isManager)
  const noteConfig: StaffActionConfig = { action: 'note', label: 'Add internal note', variant: 'outline', note: { label: 'Internal note (staff only)', required: true } }
  const openConfig = [...actions, noteConfig].find((a) => a.action === open)
  const [assignState, assignAction, assignPending] = useActionState(staffClaimAction, initialActionState)

  return (
    <div className="flex flex-col gap-3">
      {status === 'ready_for_validation' && homeownerValidation === 'pending' && (
        <p className="text-sm text-muted-foreground">Waiting for the homeowner to accept or reject the repair.</p>
      )}
      {status === 'info_requested' && <p className="text-sm text-muted-foreground">Waiting for the homeowner to reply.</p>}
      {openConfig ? (
        <StaffActionForm claimId={claimId} projectId={projectId} config={openConfig} onDone={() => setOpen(null)} />
      ) : (
        <div className="flex flex-wrap items-start gap-2">
          {actions.map((a) =>
            a.note || a.corrective ? (
              <Button key={a.action} size="sm" variant={a.variant === 'outline' ? 'outline' : 'default'} onClick={() => setOpen(a.action)}>
                {a.label}
              </Button>
            ) : (
              <QuickStaffAction key={a.action} claimId={claimId} projectId={projectId} config={a} />
            ),
          )}
          {status !== 'closed' && (
            <Button size="sm" variant="ghost" onClick={() => setOpen('note')}>
              Add internal note
            </Button>
          )}
        </div>
      )}
      {status !== 'closed' && (
        <form action={assignAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="claim_id" value={claimId} />
          <input type="hidden" name="project_id" value={projectId} />
          <input type="hidden" name="action" value="assign" />
          <div className="flex min-w-48 flex-col gap-1.5">
            <Label htmlFor={`assignee-${claimId}`} className="text-xs text-muted-foreground">
              Assigned to
            </Label>
            <select id={`assignee-${claimId}`} name="assignee" defaultValue={assignedTo ?? ''} className={selectClass}>
              <option value="">Unassigned</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" size="sm" variant="outline" disabled={assignPending}>
            {assignPending ? 'Saving...' : 'Assign'}
          </Button>
          {assignState.error && <p role="alert" className="text-xs text-destructive">{assignState.error}</p>}
        </form>
      )}
    </div>
  )
}

export function HomeownerClaimControls({
  claimId,
  projectId,
  status,
  homeownerValidation,
}: {
  claimId: string
  projectId: string
  status: string
  homeownerValidation: string
}) {
  const [state, action, pending] = useActionState(homeownerClaimAction, initialActionState)
  const [rejecting, setRejecting] = useState(false)
  const attachments = useClaimAttachments()

  if (state.success) return <p role="status" className="text-sm text-primary">{state.success}</p>

  if (status === 'info_requested') {
    return (
      <form
        onSubmit={(e) => submitWithAttachments(e, attachments, action, pending)}
        className="flex flex-col gap-3 rounded-lg border p-4"
        aria-busy={pending}
      >
        <input type="hidden" name="claim_id" value={claimId} />
        <input type="hidden" name="project_id" value={projectId} />
        <input type="hidden" name="action" value="provide_info" />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`reply-${claimId}`}>Your reply</Label>
          <Textarea id={`reply-${claimId}`} name="note" rows={3} maxLength={2000} required />
        </div>
        <ClaimAttachments controller={attachments} disabled={pending} idPrefix={`reply-${claimId}`} />
        <Message state={state} />
        <Button type="submit" size="sm" disabled={pending} className="w-fit">
          {pending ? pendingLabel('Sending', attachments.items.length) : 'Send to builder'}
        </Button>
      </form>
    )
  }

  if (status === 'ready_for_validation' && homeownerValidation === 'pending') {
    return (
      <div className="flex flex-col gap-3 rounded-lg border p-4">
        <p className="text-sm">Your builder has finished the repair. Please confirm whether the issue is resolved.</p>
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="claim_id" value={claimId} />
          <input type="hidden" name="project_id" value={projectId} />
          <input type="hidden" name="action" value={rejecting ? 'reject_repair' : 'accept_repair'} />
          {rejecting && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`reject-${claimId}`}>What still needs attention?</Label>
              <Textarea id={`reject-${claimId}`} name="note" rows={3} maxLength={2000} required />
            </div>
          )}
          <Message state={state} />
          <div className="flex flex-wrap gap-2">
            {rejecting ? (
              <>
                <Button type="submit" size="sm" variant="outline" disabled={pending}>
                  {pending ? 'Sending...' : 'Send back for more work'}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setRejecting(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button type="submit" size="sm" disabled={pending}>
                  {pending ? 'Saving...' : 'Yes, the repair is complete'}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setRejecting(true)}>
                  Not resolved
                </Button>
              </>
            )}
          </div>
        </form>
      </div>
    )
  }

  return null
}
