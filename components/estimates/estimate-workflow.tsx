'use client'

import Link from 'next/link'
import { useActionState, useState, useTransition, type ReactNode } from 'react'
import { AlertTriangle, BadgeCheck, CircleAlert, Copy, Loader2, MoreHorizontal, ShieldAlert, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { NativeSelect } from '@/components/shared/form-field'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'
import { ActionButton } from '@/components/shared/inline-action'
import { initialActionState, type ActionState } from '@/lib/action-state'
import { useEstimateDraft } from '@/components/estimates/estimate-draft-context'
import {
  changeEstimateStatusAction,
  createEstimateRevisionAction,
  deleteDraftEstimateAction,
  duplicateEstimateAction,
  recordEstimateDecisionAction,
} from '@/app/actions/estimates'
import { DECISION_METHODS, DECISION_METHOD_LABELS, formatCentsExact, type EstimateStatus } from '@/lib/estimates'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Status changes and copies run on the saved estimate, so unsaved edits are saved (or kept) first. */
function useAfterSave() {
  const draft = useEstimateDraft()
  return (purpose: string, run: () => Promise<ActionState>) => async (): Promise<ActionState> => {
    const saved = draft ? await draft.ensureSaved(purpose) : 'clean'
    if (saved === 'cancelled') return initialActionState
    if (saved === 'failed') return { error: 'Your edits did not save, so nothing else changed. Fix the issue and try again.' }
    return run()
  }
}

function DecisionForm({ estimateId, defaultName, onCancel }: { estimateId: string; defaultName: string; onCancel: () => void }) {
  const [state, formAction] = useActionState(recordEstimateDecisionAction.bind(null, estimateId), initialActionState)
  const fe = state.fieldErrors ?? {}
  const v = state.values ?? {}
  const today = new Date().toISOString().slice(0, 10)
  const inputClass =
    'h-10 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive'

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-3 rounded-lg border bg-background p-4" noValidate>
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-semibold text-foreground">Record client decision</h3>
        <p className="text-xs text-muted-foreground">
          Records a decision you received outside the app. It is not an electronic signature.
        </p>
      </div>
      <fieldset className="grid grid-cols-2 gap-2 sm:max-w-sm">
        <legend className="sr-only">Decision</legend>
        {(['approved', 'rejected'] as const).map((d) => (
          <label
            key={d}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium has-checked:border-primary has-checked:bg-primary/10 has-checked:text-primary"
          >
            <input type="radio" name="decision" value={d} defaultChecked={(v.decision ?? 'approved') === d} className="sr-only" />
            {d === 'approved' ? 'Approved' : 'Rejected'}
          </label>
        ))}
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Decided by</span>
          <input
            name="decision_by_name"
            defaultValue={v.decision_by_name ?? defaultName}
            aria-invalid={fe.decision_by_name ? true : undefined}
            className={inputClass}
          />
          {fe.decision_by_name && <span className="text-xs text-destructive">{fe.decision_by_name}</span>}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Received via</span>
          <NativeSelect name="decision_method" defaultValue={v.decision_method ?? ''} aria-invalid={fe.decision_method ? true : undefined}>
            <option value="" disabled>
              Select
            </option>
            {DECISION_METHODS.map((m) => (
              <option key={m} value={m}>
                {DECISION_METHOD_LABELS[m]}
              </option>
            ))}
          </NativeSelect>
          {fe.decision_method && <span className="text-xs text-destructive">{fe.decision_method}</span>}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Decision date</span>
          <input type="date" name="decision_date" max={today} defaultValue={v.decision_date ?? today} className={inputClass} />
          {fe.decision_date && <span className="text-xs text-destructive">{fe.decision_date}</span>}
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">Note (optional)</span>
        <textarea
          name="decision_note"
          maxLength={2000}
          defaultValue={v.decision_note ?? ''}
          className="min-h-16 rounded-lg border border-input bg-background px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </label>
      <FormMessage state={state} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton size="default">Record decision</SubmitButton>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

type Requirement = { key: string; tone: 'blocker' | 'warning'; text: string; action: ReactNode }

function RequirementList({ items }: { items: Requirement[] }) {
  if (items.length === 0) return null
  return (
    <ul className="flex flex-col divide-y rounded-lg border bg-background" aria-label="Before sending">
      {items.map((r) => {
        const Icon = r.tone === 'blocker' ? CircleAlert : AlertTriangle
        return (
          <li key={r.key} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-3 py-2">
            <span className="flex min-w-0 items-start gap-2 text-sm text-foreground">
              <Icon
                className={cn('mt-0.5 size-4 shrink-0', r.tone === 'blocker' ? 'text-destructive' : 'text-warning')}
                aria-hidden="true"
              />
              <span>
                <span className="sr-only">{r.tone === 'blocker' ? 'Required: ' : 'Warning: '}</span>
                {r.text}
              </span>
            </span>
            {r.action}
          </li>
        )
      })}
    </ul>
  )
}

function SummaryItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm font-semibold text-foreground">{children}</dd>
    </div>
  )
}

/** "Ready to send?" — saved summary, relevant requirements with fixes, and the eligible workflow actions. */
export function EstimateReadiness({
  estimateId,
  status,
  revision,
  isLatest,
  latestHref,
  hasOpenRevision,
  lineCount,
  clientName,
  totalCents,
  estimateDate,
  expirationDate,
  editHref,
  clientHref,
  canManage,
  signing,
  decision,
}: {
  estimateId: string
  status: EstimateStatus
  revision: number
  isLatest: boolean
  latestHref: string | null
  hasOpenRevision: boolean
  lineCount: number
  clientName: string | null
  totalCents: number
  estimateDate: string | null
  expirationDate: string | null
  editHref: string | null
  clientHref: string | null
  canManage: boolean
  signing: ReactNode
  decision: ReactNode
}) {
  const [showDecision, setShowDecision] = useState(false)
  const draft = useEstimateDraft()
  const afterSave = useAfterSave()
  const dirty = Boolean(draft?.sheet?.dirty)
  const saving = Boolean(draft?.sheet?.saving || draft?.sheet?.refreshing)
  const editableStatus = status === 'draft' || status === 'internal_review'
  const locked = !editableStatus
  const canAct = canManage && isLatest

  const heading = !isLatest
    ? 'Older revision'
    : editableStatus
      ? 'Ready to send?'
      : status === 'submitted'
        ? 'Waiting on the client'
        : status === 'approved'
          ? 'Approved'
          : 'Rejected'

  const requirements: Requirement[] = []
  if (canAct && editableStatus) {
    if (dirty)
      requirements.push({
        key: 'unsaved',
        tone: 'warning',
        text: 'Unsaved changes. Workflow actions use the saved estimate.',
        action: (
          <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => void draft?.save()}>
            {saving && <Loader2 data-icon="inline-start" className="animate-spin" />}
            Save draft
          </Button>
        ),
      })
    if (lineCount === 0)
      requirements.push({
        key: 'items',
        tone: 'blocker',
        text: 'Add at least one cost item before locking for client review.',
        action: (
          <Button type="button" size="sm" variant="outline" onClick={() => draft?.setTab('items')}>
            Add cost items
          </Button>
        ),
      })
    if (!clientName)
      requirements.push({
        key: 'client',
        tone: 'warning',
        text: 'No client on this estimate. It uses the project’s primary client when the estimate is created.',
        action: clientHref && (
          <Button size="sm" variant="outline" render={<Link href={clientHref} />} nativeButton={false}>
            Assign client
          </Button>
        ),
      })
    if (!expirationDate)
      requirements.push({
        key: 'expiration',
        tone: 'warning',
        text: 'Expiration not set. Dates mentioned in notes are not used.',
        action: editHref && (
          <Button size="sm" variant="outline" render={<Link href={`${editHref}#expiration_date`} />} nativeButton={false}>
            Set date
          </Button>
        ),
      })
  }

  const lockReason = lineCount === 0 ? 'lock-reason' : undefined

  return (
    <section aria-labelledby="workflow-heading" className="surface flex flex-col gap-4 p-4 md:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
        <div className="flex flex-col gap-1">
          <h2 id="workflow-heading" tabIndex={-1} className="type-section-title text-foreground outline-none">
            {heading}
          </h2>
          {!isLatest ? (
            <p className="text-sm text-muted-foreground">A newer revision exists. This version is read-only history.</p>
          ) : status === 'approved' ? (
            <p className="flex items-center gap-1.5 text-sm text-primary">
              <BadgeCheck className="size-4 shrink-0" aria-hidden="true" />
              {`Revision ${revision} is locked. Create a revision for any changes.`}
            </p>
          ) : locked ? (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <ShieldAlert className="size-4 shrink-0 text-warning" aria-hidden="true" />
              {status === 'submitted'
                ? `Revision ${revision} is locked for client review. Collect a signature or record their decision.`
                : `Revision ${revision} was rejected and is preserved for history.`}
            </p>
          ) : null}
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4 lg:shrink-0">
          <SummaryItem label="Construction total">
            <span className="tabular-nums">{formatCentsExact(totalCents)}</span>
          </SummaryItem>
          <SummaryItem label="Client">{clientName ?? <span className="text-warning">Not assigned</span>}</SummaryItem>
          <SummaryItem label="Estimate date">{estimateDate ? formatDate(estimateDate) : '—'}</SummaryItem>
          <SummaryItem label="Expires">
            {expirationDate ? formatDate(expirationDate) : <span className="text-warning">Not set</span>}
          </SummaryItem>
        </dl>
      </div>

      <RequirementList items={requirements} />

      {decision}

      {!isLatest && latestHref && (
        <div>
          <Button render={<Link href={latestHref} />} nativeButton={false}>
            Open latest revision
          </Button>
        </div>
      )}

      {canAct && (editableStatus || status === 'submitted' || !hasOpenRevision) && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-start gap-2">
            {editableStatus && (
              <ActionButton
                action={afterSave('lock it for client review', () => changeEstimateStatusAction(estimateId, 'submitted'))}
                label="Lock & mark sent for client review"
                pendingLabel="Locking..."
                confirmMessage={`Lock Revision ${revision} and mark it as sent for client review?\n\nCost items and pricing can no longer be edited; changes will need a new revision.\n\nNothing is emailed. Share the PDF or request signatures afterward.`}
                variant="default"
                size="default"
                disabled={lineCount === 0}
                describedBy={lockReason}
              />
            )}
            {status === 'draft' && (
              <ActionButton
                action={afterSave('send it to internal review', () => changeEstimateStatusAction(estimateId, 'internal_review'))}
                label="Send to internal review"
                variant="outline"
                size="default"
              />
            )}
            {status === 'internal_review' && (
              <ActionButton
                action={() => changeEstimateStatusAction(estimateId, 'draft')}
                label="Return to draft"
                variant="outline"
                size="default"
              />
            )}
            {status === 'submitted' && !showDecision && (
              <Button type="button" onClick={() => setShowDecision(true)}>
                Record approval or rejection
              </Button>
            )}
            {locked && !hasOpenRevision && (
              <ActionButton
                action={() => createEstimateRevisionAction(estimateId)}
                label="Create revision"
                pendingLabel="Creating..."
                variant="outline"
                size="default"
              />
            )}
          </div>
          {editableStatus && (
            <p id={lockReason} className="text-xs text-muted-foreground">
              {lineCount === 0
                ? 'Locking is available once the estimate has at least one cost item.'
                : status === 'draft'
                  ? 'Internal review is optional. Locking does not email anyone.'
                  : 'Locking does not email anyone.'}
            </p>
          )}
          {status === 'submitted' && showDecision && (
            <DecisionForm estimateId={estimateId} defaultName={clientName ?? ''} onCancel={() => setShowDecision(false)} />
          )}
        </div>
      )}

      {signing}
    </section>
  )
}

/** Secondary and destructive estimate actions, kept out of the main workflow area. */
export function EstimateMoreMenu({ estimateId, status }: { estimateId: string; status: EstimateStatus }) {
  const [pending, startTransition] = useTransition()
  const afterSave = useAfterSave()

  const run = (action: () => Promise<ActionState>) =>
    startTransition(async () => {
      const result = await action()
      if (result.error) toast.error(result.error)
      else if (result.success) toast.success(result.success)
    })

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" aria-label="More estimate actions" disabled={pending} />}
      >
        {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <MoreHorizontal aria-hidden="true" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={() => run(afterSave('duplicate it', () => duplicateEstimateAction(estimateId)))}>
          <Copy aria-hidden="true" />
          Duplicate as new estimate
        </DropdownMenuItem>
        {status === 'draft' && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => {
                if (!window.confirm('Delete this draft estimate and its line items? This cannot be undone.')) return
                run(() => deleteDraftEstimateAction(estimateId))
              }}
            >
              <Trash2 aria-hidden="true" />
              Delete draft
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
