'use client'

import { useActionState, useState } from 'react'
import { ArrowLeft, Lock, Pencil, Plus, Star } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { NativeSelect } from '@/components/shared/form-field'
import { StarDisplay } from '@/components/subcontractors/performance-stars'
import { savePerformanceReviewAction } from '@/app/actions/subcontractor-performance'
import type { ActionState } from '@/lib/action-state'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  PERFORMANCE_CRITERIA,
  formatRating,
  ratingLabel,
  reviewCountLabel,
  type CriterionKey,
  type PerformanceReview,
  type PerformanceSummary,
} from '@/lib/subcontractor-performance'

export type RatingProject = { projectId: string; projectName: string; projectNumber: string }

type Props = {
  companyId: string
  companyName: string
  availability: 'ready' | 'setup-required' | 'error'
  summary: PerformanceSummary
  reviews: PerformanceReview[]
  reviewerNames: Record<string, string>
  projects: RatingProject[]
  currentUserId: string
  canReview: boolean
  initialProjectId?: string | null
}

type View = { mode: 'panel' } | { mode: 'form'; projectId: string }

export function PerformanceRating(props: Props) {
  const { availability, summary } = props
  const initialProject =
    props.canReview && props.initialProjectId && props.projects.some((p) => p.projectId === props.initialProjectId)
      ? props.initialProjectId
      : null
  const [open, setOpen] = useState(Boolean(initialProject))
  const [view, setView] = useState<View>(initialProject ? { mode: 'form', projectId: initialProject } : { mode: 'panel' })
  const [busy, setBusy] = useState(false)

  if (availability !== 'ready') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="font-medium">Performance:</span>
        {availability === 'setup-required' ? 'Not set up yet' : 'Unavailable right now'}
      </span>
    )
  }

  const rated = summary.average !== null
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setView({ mode: 'panel' })
          setOpen(true)
        }}
        aria-haspopup="dialog"
        aria-label={
          rated
            ? `Performance rating ${formatRating(summary.average)} out of 5 from ${reviewCountLabel(summary.count)}. Open performance details`
            : 'Not rated yet. Open performance details'
        }
        className="-mx-1.5 flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {rated ? (
          <>
            <StarDisplay value={summary.average as number} />
            <span className="text-sm font-semibold tabular-nums text-foreground">{formatRating(summary.average)}</span>
            <span className="text-xs text-muted-foreground underline-offset-4 hover:underline">
              {reviewCountLabel(summary.count)}
            </span>
          </>
        ) : (
          <>
            <Star className="size-3.5 text-muted-foreground/60" aria-hidden="true" />
            <span className="text-xs font-medium text-muted-foreground underline-offset-4 hover:underline">Not rated yet</span>
          </>
        )}
      </button>

      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <DialogContent showCloseButton={!busy} className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          {view.mode === 'panel' ? (
            <PerformancePanel {...props} onWrite={(projectId) => setView({ mode: 'form', projectId })} />
          ) : (
            <ReviewForm
              {...props}
              initialProjectId={view.projectId}
              onBusyChange={setBusy}
              onDone={() => setView({ mode: 'panel' })}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function PerformancePanel({
  companyName,
  summary,
  reviews,
  reviewerNames,
  projects,
  currentUserId,
  canReview,
  onWrite,
}: Props & { onWrite: (projectId: string) => void }) {
  const rated = summary.average !== null
  return (
    <>
      <DialogHeader>
        <DialogTitle>Performance</DialogTitle>
        <DialogDescription className="flex items-start gap-1.5">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          Internal to your builder team. Ratings never change qualification, compliance, or project status.
        </DialogDescription>
      </DialogHeader>

      <section aria-label={`${companyName} rating summary`} className="flex flex-col gap-4 rounded-xl border bg-muted/30 p-4 sm:flex-row sm:gap-6">
        <div className="flex shrink-0 flex-col gap-1 sm:w-36">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Overall</span>
          {rated ? (
            <>
              <span className="font-serif text-3xl font-semibold tabular-nums text-foreground">
                {formatRating(summary.average)}
                <span className="text-base font-normal text-muted-foreground"> / 5</span>
              </span>
              <StarDisplay value={summary.average as number} />
              <span className="text-xs text-muted-foreground">{reviewCountLabel(summary.count)}</span>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">No reviews yet</span>
          )}
        </div>
        <dl className="grid flex-1 grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          {PERFORMANCE_CRITERIA.map((c) => {
            const s = summary.criteria[c.key]
            return (
              <div key={c.key} className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-1.5 last:border-0 sm:[&:nth-last-child(2)]:border-0">
                <dt className="text-sm text-foreground/80">{c.label}</dt>
                <dd className="shrink-0 text-sm">
                  {s.average === null ? (
                    <span className="text-xs text-muted-foreground">Not assessed</span>
                  ) : (
                    <span className="flex items-baseline gap-1">
                      <span className="font-semibold tabular-nums text-foreground">{formatRating(s.average)}</span>
                      <span className="text-xs text-muted-foreground">{`(${s.count})`}</span>
                    </span>
                  )}
                </dd>
              </div>
            )
          })}
        </dl>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">Reviews</h3>
        {canReview &&
          (projects.length ? (
            <Button size="sm" onClick={() => onWrite('')}>
              <Plus data-icon="inline-start" />
              Add review
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">Link this company to a project to review it.</span>
          ))}
      </div>

      {reviews.length === 0 ? (
        <p className="rounded-lg bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
          No one has reviewed this subcontractor yet.
        </p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {reviews.map((r) => {
            const mine = r.reviewer_id === currentUserId
            const assessed = PERFORMANCE_CRITERIA.filter((c) => r[c.key] !== null)
            return (
              <li key={r.id} className="flex flex-col gap-2 px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium text-foreground">
                      {r.project?.name ?? 'Project'}
                      {r.project?.project_number && (
                        <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">{r.project.project_number}</span>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {mine ? 'You' : (reviewerNames[r.reviewer_id] ?? 'Team member')}
                      {' · '}
                      {formatDate(r.updated_at)}
                      {r.revision > 1 && ' · Edited'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1.5" aria-label={`Overall ${r.overall_rating} out of 5`}>
                      <StarDisplay value={r.overall_rating} />
                      <span className="text-sm font-semibold tabular-nums text-foreground" aria-hidden="true">
                        {r.overall_rating}
                      </span>
                    </span>
                    {mine && canReview && projects.some((p) => p.projectId === r.project_id) && (
                      <Button size="sm" variant="ghost" onClick={() => onWrite(r.project_id)} aria-label={`Edit your review for ${r.project?.name ?? 'this project'}`}>
                        <Pencil data-icon="inline-start" />
                        Edit
                      </Button>
                    )}
                  </div>
                </div>
                {assessed.length > 0 && (
                  <ul className="flex flex-wrap gap-1.5" aria-label="Category ratings">
                    {assessed.map((c) => (
                      <li key={c.key} className="rounded-badge bg-muted px-2 py-0.5 text-xs text-foreground/80">
                        {c.label} <span className="font-semibold tabular-nums text-foreground">{r[c.key]}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {r.comments && <p className="whitespace-pre-line text-sm text-foreground/90">{r.comments}</p>}
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

function ReviewForm({
  companyId,
  companyName,
  reviews,
  projects,
  currentUserId,
  initialProjectId,
  onBusyChange,
  onDone,
}: Props & { onBusyChange: (busy: boolean) => void; onDone: () => void }) {
  const [projectId, setProjectId] = useState(initialProjectId ?? '')
  const mine = reviews.find((r) => r.reviewer_id === currentUserId && r.project_id === projectId) ?? null
  const fixedProject = Boolean(initialProjectId)

  const [state, formAction, pending] = useActionState(async (prev: ActionState, fd: FormData) => {
    onBusyChange(true)
    try {
      const result = await savePerformanceReviewAction(prev, fd)
      if (result.success) {
        toast.success(result.success)
        onDone()
      }
      return result
    } catch {
      return { error: 'Something went wrong. Nothing was saved. Please try again.' }
    } finally {
      onBusyChange(false)
    }
  }, {} as ActionState)
  const fe = state.fieldErrors ?? {}
  const projectName = projects.find((p) => p.projectId === projectId)?.projectName

  return (
    <>
      <DialogHeader>
        <DialogTitle>{mine ? 'Edit your review' : 'Add review'}</DialogTitle>
        <DialogDescription>
          {projectName ? `${companyName} on ${projectName}.` : `${companyName}.`} Internal only. Only you can edit your review.
        </DialogDescription>
      </DialogHeader>

      <form action={formAction} className="flex flex-col gap-5" aria-busy={pending}>
        <input type="hidden" name="company_id" value={companyId} />
        <input type="hidden" name="expected_revision" value={mine?.revision ?? ''} />

        {fixedProject ? (
          <input type="hidden" name="project_id" value={projectId} />
        ) : (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="review-project" className="text-sm font-medium text-foreground">
              Project
            </label>
            <NativeSelect
              id="review-project"
              name="project_id"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              required
              aria-invalid={fe.project_id ? true : undefined}
              aria-describedby={fe.project_id ? 'review-project-error' : undefined}
            >
              <option value="" disabled>
                Choose a project this company worked on
              </option>
              {projects.map((p) => {
                const reviewed = reviews.some((r) => r.reviewer_id === currentUserId && r.project_id === p.projectId)
                return (
                  <option key={p.projectId} value={p.projectId}>
                    {`${p.projectName} (${p.projectNumber})${reviewed ? ' – edit your review' : ''}`}
                  </option>
                )
              })}
            </NativeSelect>
            {fe.project_id && (
              <p id="review-project-error" className="text-xs text-destructive">
                {fe.project_id}
              </p>
            )}
            {mine && (
              <p className="text-xs text-muted-foreground">
                {`You reviewed this project on ${formatDate(mine.updated_at)}. Saving updates that review.`}
              </p>
            )}
          </div>
        )}

        <ScoreFields key={projectId || 'none'} review={mine} errors={fe} />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="review-comments" className="text-sm font-medium text-foreground">
            Comments <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <Textarea
            key={`comments-${projectId}`}
            id="review-comments"
            name="comments"
            rows={3}
            maxLength={2000}
            defaultValue={mine?.comments ?? ''}
            placeholder="What went well, and what should the team know next time?"
            aria-invalid={fe.comments ? true : undefined}
          />
          {fe.comments && <p className="text-xs text-destructive">{fe.comments}</p>}
        </div>

        <div className="flex flex-col gap-1">
          <label className="flex items-start gap-2.5 text-sm text-foreground">
            <input
              type="checkbox"
              name="work_confirmed"
              value="yes"
              required
              className="mt-0.5 size-4 shrink-0 accent-primary"
              aria-invalid={fe.work_confirmed ? true : undefined}
              aria-describedby={fe.work_confirmed ? 'work-confirmed-error' : undefined}
            />
            {'I assessed this company’s work on this project.'}
          </label>
          {fe.work_confirmed && (
            <p id="work-confirmed-error" className="pl-6.5 text-xs text-destructive">
              {fe.work_confirmed}
            </p>
          )}
        </div>

        {state.error && (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {state.error}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-between">
          <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
            <ArrowLeft data-icon="inline-start" />
            Back to reviews
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? 'Saving…' : mine ? 'Save changes' : 'Save review'}
          </Button>
        </div>
      </form>
    </>
  )
}

function ScoreFields({ review, errors }: { review: PerformanceReview | null; errors: Record<string, string> }) {
  const [overall, setOverall] = useState<number | null>(review?.overall_rating ?? null)
  const [scores, setScores] = useState<Record<CriterionKey, number | null>>(() => ({
    quality: review?.quality ?? null,
    schedule_reliability: review?.schedule_reliability ?? null,
    communication: review?.communication ?? null,
    cleanliness: review?.cleanliness ?? null,
    safety: review?.safety ?? null,
  }))
  return (
    <>
      <StarInput
        name="overall_rating"
        label="Overall rating"
        hint="Required. Your overall judgment, entered separately from the categories."
        value={overall}
        error={errors.overall_rating}
        onChange={setOverall}
        prominent
      />
      <fieldset className="flex flex-col gap-3 rounded-xl border p-4">
        <legend className="px-1 text-sm font-medium text-foreground">
          Categories <span className="font-normal text-muted-foreground">(optional)</span>
        </legend>
        {PERFORMANCE_CRITERIA.map((c) => (
          <StarInput
            key={c.key}
            name={c.key}
            label={c.label}
            hint={c.hint}
            allowNa
            value={scores[c.key]}
            error={errors[c.key]}
            onChange={(v) => setScores((s) => ({ ...s, [c.key]: v }))}
          />
        ))}
      </fieldset>
    </>
  )
}

function StarInput({
  name,
  label,
  hint,
  value,
  error,
  onChange,
  allowNa = false,
  prominent = false,
}: {
  name: string
  label: string
  hint: string
  value: number | null
  error?: string
  onChange: (value: number | null) => void
  allowNa?: boolean
  prominent?: boolean
}) {
  const hintId = `${name}-hint`
  const errorId = `${name}-error`
  return (
    <fieldset
      className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
      aria-describedby={error ? `${hintId} ${errorId}` : hintId}
      aria-invalid={error ? true : undefined}
    >
      <div className="flex min-w-0 flex-col">
        <legend className={cn('font-medium text-foreground', prominent ? 'text-base' : 'text-sm')}>{label}</legend>
        <span id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </span>
        {error && (
          <span id={errorId} className="text-xs text-destructive">
            {error}
          </span>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1">
        <div className="flex items-center" role="presentation">
          {[1, 2, 3, 4, 5].map((n) => (
            <label
              key={n}
              className="flex size-9 cursor-pointer items-center justify-center rounded-md has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring"
            >
              <input
                type="radio"
                name={name}
                value={n}
                checked={value === n}
                onChange={() => onChange(n)}
                required={!allowNa}
                className="sr-only"
              />
              <span className="sr-only">{`${n} ${n === 1 ? 'star' : 'stars'}, ${ratingLabel(n)}`}</span>
              <Star
                aria-hidden="true"
                className={cn(
                  prominent ? 'size-7' : 'size-6',
                  value !== null && n <= value ? 'fill-amber-500 text-amber-500' : 'text-muted-foreground/40',
                )}
              />
            </label>
          ))}
          {allowNa && (
            <label className="ml-1 flex h-9 cursor-pointer items-center rounded-md px-2 text-xs font-medium text-muted-foreground has-[:checked]:bg-muted has-[:checked]:text-foreground has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring">
              <input
                type="radio"
                name={name}
                value="na"
                checked={value === null}
                onChange={() => onChange(null)}
                className="sr-only"
              />
              Not assessed
            </label>
          )}
        </div>
        <span className="w-32 text-xs text-muted-foreground" aria-hidden="true">
          {value === null ? (allowNa ? '' : 'Choose 1–5') : `${value} · ${ratingLabel(value)}`}
        </span>
      </div>
    </fieldset>
  )
}
