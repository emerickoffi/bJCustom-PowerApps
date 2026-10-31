'use client'

import { useActionState, useState } from 'react'
import { AlertTriangle, Lock, Star } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Surface } from '@/components/shared/page-header'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/format'
import type { ActionState } from '@/lib/action-state'
import { savePerformanceReviewAction } from '@/app/actions/subcontractor-performance'
import {
  PERFORMANCE_CRITERIA,
  formatRating,
  overallRating,
  ratingCountLabel,
  type CriterionKey,
  type PerformanceReview,
  type PerformanceSummary,
} from '@/lib/subcontractor-performance'
import { StarDisplay } from '@/components/subcontractors/performance-stars'

export type RateableAssignment = {
  assignmentId: string
  projectId: string
  projectName: string
  projectNumber: string
  associatedAt: string
  endedAt: string | null
}

export type VerifiedWork = { id: string; projectId: string; label: string; acceptedAt: string | null }

type Props = {
  companyId: string
  companyName: string
  availability: 'ready' | 'setup-required' | 'error'
  summary: PerformanceSummary
  reviews: PerformanceReview[]
  assignments: RateableAssignment[]
  verifiedWork: VerifiedWork[]
  reviewerNames: Record<string, string>
  /** Opened from a "Rate Subcontractor" prompt after verifying work. */
  initialRate?: { assignmentId: string; submissionId: string | null } | null
}

export function PerformanceSection(props: Props) {
  const { availability, summary, reviews, assignments } = props
  const byAssignment = new Map(reviews.map((r) => [r.project_assignment_id, r]))
  const initial = props.initialRate && assignments.some((a) => a.assignmentId === props.initialRate!.assignmentId)
    ? props.initialRate
    : null
  const [rating, setRating] = useState<{ assignmentId: string; submissionId: string | null } | null>(initial)
  const active = rating ? assignments.find((a) => a.assignmentId === rating.assignmentId) : undefined

  return (
    <Surface id="performance" aria-labelledby="performance-heading" className="scroll-mt-24 gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id="performance-heading" className="font-serif text-lg font-semibold tracking-tight text-foreground">
            Performance
          </h2>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Lock className="size-3.5 shrink-0" aria-hidden="true" />
            Internal only. Not visible to subcontractors or homeowners, and separate from qualification.
          </p>
        </div>
        {availability === 'ready' && summary.average !== null && (
          <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
            <span className="font-serif text-2xl font-semibold tabular-nums text-foreground">{formatRating(summary.average)}</span>
            <span className="flex flex-col gap-0.5">
              <StarDisplay value={summary.average} />
              <span className="text-xs text-muted-foreground">{ratingCountLabel(summary.count)}</span>
            </span>
          </div>
        )}
      </div>

      {availability === 'setup-required' ? (
        <p className="flex items-start gap-2 rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          Performance ratings are not set up in this environment yet.
        </p>
      ) : availability === 'error' ? (
        <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
          Ratings could not be loaded. Refresh the page to try again.
        </p>
      ) : (
        <div className="flex flex-col gap-5 border-t pt-4">
          {summary.count > 0 && (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
              {PERFORMANCE_CRITERIA.map((c) => (
                <div key={c.key} className="flex flex-col gap-1">
                  <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{c.label}</dt>
                  <dd className="flex items-center gap-1.5 text-sm font-semibold tabular-nums text-foreground">
                    <StarDisplay value={summary.criteria[c.key]} />
                    {formatRating(summary.criteria[c.key])}
                  </dd>
                </div>
              ))}
            </dl>
          )}

          <section aria-labelledby="ratings-by-project-heading" className="flex flex-col gap-2">
            <h3 id="ratings-by-project-heading" className="text-sm font-semibold text-foreground">
              Ratings by Project
            </h3>
            {assignments.length === 0 ? (
              <p className="rounded-lg bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
                Assign this subcontractor to a project to rate their work there.
              </p>
            ) : (
              <ul className="flex flex-col divide-y rounded-lg border">
                {assignments.map((a) => {
                  const review = byAssignment.get(a.assignmentId)
                  return (
                    <li key={a.assignmentId} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                      <div className="flex min-w-0 flex-col gap-1">
                        <span className="truncate text-sm font-medium text-foreground">{a.projectName}</span>
                        <span className="text-xs text-muted-foreground">
                          <span className="font-mono">{a.projectNumber}</span>
                          {' · '}
                          {a.endedAt ? `${formatDate(a.associatedAt)} – ${formatDate(a.endedAt)}` : `Since ${formatDate(a.associatedAt)}`}
                        </span>
                        {review ? (
                          <>
                            <span className="flex items-center gap-1.5">
                              <StarDisplay value={review.overall_rating} />
                              <span className="text-sm font-semibold tabular-nums">{formatRating(review.overall_rating)}</span>
                              <span className="text-xs text-muted-foreground">
                                {'by '}
                                {props.reviewerNames[review.reviewed_by] ?? 'Team member'}
                                {' · '}
                                {formatDate(review.updated_at)}
                                {review.revision > 1 ? ` · Revised (v${review.revision})` : ''}
                              </span>
                            </span>
                            {review.comments && (
                              <p className="max-w-prose whitespace-pre-line text-sm text-foreground/85">{review.comments}</p>
                            )}
                          </>
                        ) : (
                          <span className="text-sm text-muted-foreground/80">Not rated yet</span>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant={review ? 'outline' : 'default'}
                        size="sm"
                        className="self-start"
                        onClick={() => setRating({ assignmentId: a.assignmentId, submissionId: review?.submission_id ?? null })}
                      >
                        <Star data-icon="inline-start" />
                        {review ? 'Revise rating' : 'Rate'}
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>
      )}

      {active && rating && (
        <RatingDialog
          key={`${active.assignmentId}-${byAssignment.get(active.assignmentId)?.revision ?? 0}`}
          companyId={props.companyId}
          companyName={props.companyName}
          assignment={active}
          review={byAssignment.get(active.assignmentId)}
          initialSubmissionId={rating.submissionId}
          verifiedWork={props.verifiedWork.filter((w) => w.projectId === active.projectId)}
          onClose={() => setRating(null)}
        />
      )}
    </Surface>
  )
}

type Scores = Record<CriterionKey, number | 'na' | null>

function RatingDialog({
  companyId,
  companyName,
  assignment,
  review,
  initialSubmissionId,
  verifiedWork,
  onClose,
}: {
  companyId: string
  companyName: string
  assignment: RateableAssignment
  review: PerformanceReview | undefined
  initialSubmissionId: string | null
  verifiedWork: VerifiedWork[]
  onClose: () => void
}) {
  const [scores, setScores] = useState<Scores>(() => ({
    quality: review?.quality ?? null,
    timeliness: review?.timeliness ?? null,
    communication: review?.communication ?? null,
    professionalism: review?.professionalism ?? null,
    issue_resolution: review ? (review.issue_resolution ?? 'na') : null,
  }))
  const [submissionId, setSubmissionId] = useState(initialSubmissionId ?? 'none')

  const [state, formAction, pending] = useActionState(async (prev: ActionState, fd: FormData) => {
    try {
      const result = await savePerformanceReviewAction(prev, fd)
      if (result.success) {
        toast.success(result.success)
        onClose()
      }
      return result
    } catch {
      return { error: 'Something went wrong. Nothing was saved. Please try again.' }
    }
  }, {} as ActionState)

  const complete =
    PERFORMANCE_CRITERIA.every((c) => scores[c.key] !== null)
  const preview = complete
    ? overallRating({
        quality: scores.quality as number,
        timeliness: scores.timeliness as number,
        communication: scores.communication as number,
        professionalism: scores.professionalism as number,
        issue_resolution: scores.issue_resolution === 'na' ? null : (scores.issue_resolution as number),
      })
    : null

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent showCloseButton={!pending} className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{review ? 'Revise rating' : 'Rate subcontractor'}</DialogTitle>
          <DialogDescription>
            {companyName} on {assignment.projectName}. Ratings are internal and never change qualification status.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-5">
          <input type="hidden" name="company_id" value={companyId} />
          <input type="hidden" name="project_assignment_id" value={assignment.assignmentId} />
          <input type="hidden" name="expected_revision" value={review?.revision ?? ''} />
          <input type="hidden" name="submission_id" value={submissionId} />

          {PERFORMANCE_CRITERIA.map((c) => (
            <StarInput
              key={c.key}
              name={c.key}
              label={c.label}
              hint={c.hint}
              allowNa={'optional' in c && c.optional}
              value={scores[c.key]}
              error={state.fieldErrors?.[c.key]}
              onChange={(v) => setScores((s) => ({ ...s, [c.key]: v }))}
            />
          ))}

          {verifiedWork.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rating-work">Linked verified work (optional)</Label>
              <Select value={submissionId} onValueChange={(v) => setSubmissionId(String(v ?? 'none'))}>
                <SelectTrigger id="rating-work" className="w-full">
                  <SelectValue>
                    {(v: string) => (v === 'none' ? 'None' : verifiedWork.find((w) => w.id === v)?.label ?? 'None')}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {verifiedWork.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.label}
                      {w.acceptedAt ? ` · ${formatDate(w.acceptedAt)}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {state.fieldErrors?.submission_id && <p className="text-sm text-destructive">{state.fieldErrors.submission_id}</p>}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rating-comments">Comments (optional)</Label>
            <Textarea
              id="rating-comments"
              name="comments"
              rows={3}
              maxLength={2000}
              defaultValue={review?.comments ?? ''}
              placeholder="What went well, and what could be better next time?"
            />
            {state.fieldErrors?.comments && <p className="text-sm text-destructive">{state.fieldErrors.comments}</p>}
          </div>

          <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Overall (calculated)</span>
            <span className="flex items-center gap-1.5 font-semibold tabular-nums">
              <StarDisplay value={preview} />
              {formatRating(preview)}
            </span>
          </div>

          {state.error && (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !complete} aria-busy={pending}>
              {pending ? 'Saving...' : review ? 'Save revision' : 'Save rating'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function StarInput({
  name,
  label,
  hint,
  allowNa,
  value,
  error,
  onChange,
}: {
  name: string
  label: string
  hint: string
  allowNa: boolean
  value: number | 'na' | null
  error?: string
  onChange: (value: number | 'na') => void
}) {
  const [hover, setHover] = useState<number | null>(null)
  const shown = hover ?? (typeof value === 'number' ? value : 0)
  const errorId = `${name}-error`
  return (
    <fieldset className="flex flex-col gap-1.5" aria-describedby={error ? errorId : undefined}>
      <legend className="text-sm font-medium text-foreground">{label}</legend>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <div className="flex flex-wrap items-center gap-3" onMouseLeave={() => setHover(null)}>
        <div className="flex items-center">
          {[1, 2, 3, 4, 5].map((n) => (
            <label
              key={n}
              className="cursor-pointer rounded-md p-1 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring"
              onMouseEnter={() => setHover(n)}
            >
              <input
                type="radio"
                name={name}
                value={n}
                checked={value === n}
                onChange={() => onChange(n)}
                className="sr-only"
              />
              <span className="sr-only">
                {n} {n === 1 ? 'star' : 'stars'}
              </span>
              <Star
                aria-hidden="true"
                className={cn('size-6 transition-colors', n <= shown ? 'fill-amber-500 text-amber-500' : 'text-border')}
              />
            </label>
          ))}
        </div>
        {allowNa && (
          <label className="flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground">
            <input
              type="radio"
              name={name}
              value="na"
              checked={value === 'na'}
              onChange={() => onChange('na')}
              className="size-4 accent-primary"
            />
            N/A, no corrections needed
          </label>
        )}
      </div>
      {error && (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  )
}
