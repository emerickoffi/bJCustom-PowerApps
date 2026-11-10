'use client'

import { useActionState, useState, useTransition } from 'react'
import Link from 'next/link'
import { CalendarRange, FileDiff, HelpCircle, Plus, Unlink } from 'lucide-react'
import {
  createChangeOrderFromIssueAction,
  linkActivityAction,
  linkChangeOrderAction,
  requestReviewAction,
  respondReviewAction,
  unlinkActivityAction,
  unlinkChangeOrderAction,
} from '@/app/actions/issue-relations'
import { initialActionState } from '@/lib/action-state'
import { formatMoney } from '@/lib/financials'
import { changeOrderPath } from '@/lib/change-orders'
import { formatDate, formatDateTime } from '@/lib/format'
import type { IssueRelations } from '@/lib/issue-relations'
import { ChangeOrderStatusBadge } from '@/components/change-orders/change-order-status-badge'
import { ActivityStatusBadge } from '@/components/schedule/schedule-badges'
import { NativeSelect, SelectField, TextAreaField, TextField } from '@/components/shared/form-field'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'

type LinkResult = { ok: true; message: string } | { ok: false; error: string }

function useLinkRunner() {
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const run = (fn: () => Promise<LinkResult>, after?: () => void) =>
    startTransition(async () => {
      const r = await fn()
      setMessage(r.ok ? { tone: 'ok', text: r.message } : { tone: 'error', text: r.error })
      if (r.ok) after?.()
    })
  return { pending, message, run }
}

function InlineMessage({ message }: { message: { tone: 'ok' | 'error'; text: string } | null }) {
  if (!message) return null
  return (
    <p role={message.tone === 'error' ? 'alert' : 'status'} className={message.tone === 'error' ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
      {message.text}
    </p>
  )
}

function LinkPicker({
  label,
  options,
  pending,
  onLink,
}: {
  label: string
  options: { value: string; label: string }[]
  pending: boolean
  onLink: (id: string) => void
}) {
  const [value, setValue] = useState('')
  if (options.length === 0) return null
  const id = `link-${label.replace(/\W+/g, '-').toLowerCase()}`
  return (
    <div className="flex items-end gap-2">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
          {label}
        </label>
        <NativeSelect id={id} value={value} onChange={(e) => setValue(e.target.value)} disabled={pending}>
          <option value="">Choose…</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </NativeSelect>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={!value || pending}
        onClick={() => {
          onLink(value)
          setValue('')
        }}
      >
        Link
      </Button>
    </div>
  )
}

function DraftChangeOrderSheet({
  projectId,
  issueId,
  defaultTitle,
  defaultDescription,
  existing,
}: {
  projectId: string
  issueId: string
  defaultTitle: string
  defaultDescription: string
  existing: { id: string; co_number: string; title: string; status: IssueRelations['changeOrders'] extends (infer T)[] | null ? T extends { status: infer S } ? S : never : never }[]
}) {
  const [open, setOpen] = useState(false)
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [state, formAction] = useActionState(createChangeOrderFromIssueAction, initialActionState)
  const v = state.values ?? {}
  const err = state.fieldErrors ?? {}
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) setRequestId(crypto.randomUUID())
        setOpen(next)
      }}
    >
      <SheetTrigger render={<Button type="button" size="sm" variant="outline" />}>
        <Plus className="size-4" aria-hidden="true" />
        Draft change order
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Draft a change order from this issue</SheetTitle>
          <SheetDescription>
            Creates an internal draft linked to this issue. Nothing is sent to the homeowner, and the issue status does not change.
          </SheetDescription>
        </SheetHeader>
        <form action={formAction} className="flex flex-col gap-4 p-4">
          <input type="hidden" name="project_id" value={projectId} />
          <input type="hidden" name="issue_id" value={issueId} />
          <input type="hidden" name="request_id" value={requestId} />
          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Source issue</p>
            <p className="mt-0.5 font-medium text-foreground">{defaultTitle}</p>
            <p className="mt-1 text-xs text-muted-foreground">Issue photos stay on the issue with their existing visibility. Open them from the linked issue.</p>
          </div>
          {existing.length > 0 && (
            <div className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
              <p className="font-medium text-foreground">
                {existing.length === 1 ? 'A change order is already linked to this issue.' : `${existing.length} change orders are already linked to this issue.`}{' '}
                Open one, or continue to create another.
              </p>
              <ul className="flex flex-col gap-1.5">
                {existing.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2">
                    <Link href={changeOrderPath(projectId, c.id)} className="truncate text-primary underline-offset-4 hover:underline">
                      {c.co_number} · {c.title}
                    </Link>
                    <ChangeOrderStatusBadge status={c.status} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          <TextField name="title" label="Title" required defaultValue={v.title ?? defaultTitle} error={err.title} maxLength={160} />
          <TextAreaField name="description" label="Scope description" defaultValue={v.description ?? defaultDescription} error={err.description} rows={4} />
          <TextAreaField name="reason" label="Reason" defaultValue={v.reason ?? ''} error={err.reason} rows={2} />
          <TextField name="requested_by" label="Requested by" defaultValue={v.requested_by ?? ''} error={err.requested_by} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              name="price_adjustment"
              label="Price adjustment"
              inputMode="decimal"
              placeholder="Price pending"
              defaultValue={v.price_adjustment ?? ''}
              error={err.price_adjustment}
              hint="Leave blank if unknown. It stays marked price pending, never $0."
            />
            <TextField
              name="schedule_impact_days"
              label="Schedule impact (days)"
              inputMode="numeric"
              defaultValue={v.schedule_impact_days ?? ''}
              error={err.schedule_impact_days}
            />
          </div>
          <FormMessage state={state} />
          <SubmitButton pendingLabel="Creating draft…">Create draft</SubmitButton>
        </form>
      </SheetContent>
    </Sheet>
  )
}

function ReviewRequestForm({ projectId, issueId, reviewers }: { projectId: string; issueId: string; reviewers: { value: string; label: string }[] }) {
  const [state, formAction] = useActionState(requestReviewAction, initialActionState)
  const err = state.fieldErrors ?? {}
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="issue_id" value={issueId} />
      <SelectField name="reviewer_id" label="Ask" options={reviewers} placeholder="Choose a team member" error={err.reviewer_id} defaultValue={state.success ? '' : state.values?.reviewer_id} />
      <TextAreaField name="question" label="Question" rows={2} maxLength={1000} error={err.question} defaultValue={state.success ? '' : state.values?.question} />
      <FormMessage state={state} />
      <SubmitButton size="sm" variant="outline" pendingLabel="Sending…">
        Request review
      </SubmitButton>
    </form>
  )
}

function ReviewResponseForm({ projectId, issueId, requestId }: { projectId: string; issueId: string; requestId: string }) {
  const [state, formAction] = useActionState(respondReviewAction, initialActionState)
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="issue_id" value={issueId} />
      <input type="hidden" name="request_id" value={requestId} />
      <TextAreaField name="response" label="Your response" rows={2} maxLength={2000} error={state.fieldErrors?.response} defaultValue={state.values?.response} />
      <FormMessage state={state} />
      <SubmitButton size="sm" pendingLabel="Sending…">
        Send response
      </SubmitButton>
    </form>
  )
}

function Panel({ id, icon: Icon, title, description, children }: { id: string; icon: typeof FileDiff; title: string; description: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4 rounded-xl border bg-card p-5">
      <div className="flex flex-col gap-1">
        <h2 id={id} className="flex items-center gap-2 font-serif text-lg font-semibold text-foreground">
          <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
          {title}
        </h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  )
}

export function IssueRelatedRecords({
  projectId,
  issueId,
  relations,
  canManage,
  closed,
  currentUserId,
  reviewers,
  nameFor,
  draftDefaults,
}: {
  projectId: string
  issueId: string
  relations: IssueRelations
  canManage: boolean
  closed: boolean
  currentUserId: string
  reviewers: { value: string; label: string }[]
  nameFor: Record<string, string>
  draftDefaults: { title: string; description: string }
}) {
  const co = useLinkRunner()
  const act = useLinkRunner()
  const who = (id: string | null) => (id && nameFor[id]) || 'Team member'
  const { changeOrders, activities, reviews } = relations

  return (
    <>
      {changeOrders && (
        <Panel id="related-co-heading" icon={FileDiff} title="Change orders" description="Linking never changes the change order's status, price, or approval.">
          {changeOrders.length > 0 ? (
            <ul className="flex flex-col divide-y rounded-lg border">
              {changeOrders.map((c) => (
                <li key={c.id} className="flex items-start justify-between gap-3 p-3">
                  <Link href={changeOrderPath(projectId, c.id)} className="flex min-w-0 flex-col gap-1 hover:underline underline-offset-4">
                    <span className="text-xs font-medium tabular-nums text-primary">{c.co_number}</span>
                    <span className="truncate text-sm font-medium text-foreground">{c.title}</span>
                    <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <ChangeOrderStatusBadge status={c.status} />
                      {c.price_pending ? <span className="font-medium text-warning-foreground">Price pending</span> : formatMoney(c.price_adjustment_cents)}
                      {c.created_from_issue && <span>· From this issue</span>}
                    </span>
                  </Link>
                  {canManage && (
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      disabled={co.pending}
                      aria-label={`Unlink ${c.co_number}`}
                      onClick={() => co.run(() => unlinkChangeOrderAction(projectId, issueId, c.id))}
                    >
                      <Unlink className="size-4" aria-hidden="true" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No change orders linked.</p>
          )}
          {canManage && (
            <div className="flex flex-col gap-3">
              <LinkPicker label="Link an existing change order" options={relations.changeOrderOptions} pending={co.pending} onLink={(id) => co.run(() => linkChangeOrderAction(projectId, issueId, id))} />
              {!closed && <DraftChangeOrderSheet projectId={projectId} issueId={issueId} defaultTitle={draftDefaults.title} defaultDescription={draftDefaults.description} existing={changeOrders} />}
            </div>
          )}
          <InlineMessage message={co.message} />
        </Panel>
      )}

      {activities && (
        <Panel id="related-schedule-heading" icon={CalendarRange} title="Schedule activities" description="Reference only. Linking never moves dates or changes activity status.">
          {activities.length > 0 ? (
            <ul className="flex flex-col divide-y rounded-lg border">
              {activities.map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-3 p-3">
                  <Link href={`/projects/${projectId}/schedule?activity=${a.id}`} className="flex min-w-0 flex-col gap-1 hover:underline underline-offset-4">
                    <span className="truncate text-sm font-medium text-foreground">{a.name}</span>
                    <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <ActivityStatusBadge status={a.status} />
                      {a.planned_start && `${formatDate(a.planned_start)}${a.planned_end && a.planned_end !== a.planned_start ? ` – ${formatDate(a.planned_end)}` : ''}`}
                    </span>
                  </Link>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    disabled={act.pending}
                    aria-label={`Unlink ${a.name}`}
                    onClick={() => act.run(() => unlinkActivityAction(projectId, issueId, a.id))}
                  >
                    <Unlink className="size-4" aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No schedule activities linked.</p>
          )}
          <LinkPicker label="Link a schedule activity" options={relations.activityOptions} pending={act.pending} onLink={(id) => act.run(() => linkActivityAction(projectId, issueId, id))} />
          <InlineMessage message={act.message} />
        </Panel>
      )}

      <Panel id="reviews-heading" icon={HelpCircle} title="Review requests" description="Ask a teammate for input. This is not verification or financial approval.">
        {reviews.length > 0 && (
          <ol className="flex flex-col gap-3">
            {reviews.map((r) => (
              <li key={r.requestId} className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">
                  {who(r.requestedBy)} asked {who(r.reviewerId)} · {formatDateTime(r.requestedAt)}
                </p>
                <p className="whitespace-pre-line text-sm text-foreground">{r.question}</p>
                {r.response ? (
                  <div className="flex flex-col gap-1 border-l-2 border-primary pl-3">
                    <p className="whitespace-pre-line text-sm text-foreground">{r.response.body}</p>
                    <p className="text-xs text-muted-foreground">
                      {who(r.response.by)} · {formatDateTime(r.response.at)}
                    </p>
                  </div>
                ) : r.reviewerId === currentUserId ? (
                  <ReviewResponseForm projectId={projectId} issueId={issueId} requestId={r.requestId} />
                ) : (
                  <p className="text-xs font-medium text-warning-foreground">Awaiting response</p>
                )}
              </li>
            ))}
          </ol>
        )}
        {reviewers.length > 0 ? (
          <ReviewRequestForm projectId={projectId} issueId={issueId} reviewers={reviewers} />
        ) : (
          reviews.length === 0 && <p className="text-sm text-muted-foreground">No other team members have access to this project.</p>
        )}
      </Panel>
    </>
  )
}
