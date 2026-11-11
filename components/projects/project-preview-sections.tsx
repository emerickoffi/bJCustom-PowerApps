'use client'

import { useId } from 'react'
import Link from 'next/link'
import { ArrowRight, ImageOff, Loader2, Mail, Phone, RefreshCw, UserPlus, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CoverImage } from '@/components/projects/cover-image'
import { PREVIEW_LINK_CLASS, SubcontractorEntry } from '@/components/projects/project-preview-subcontractors'
import { ActivityStatusBadge } from '@/components/schedule/schedule-badges'
import {
  PREVIEW_SUBCONTRACTOR_LIMIT,
  type PreviewLatestUpdate,
  type PreviewNextActivity,
  type PreviewPeople,
  type PreviewPerson,
  type PreviewQuestions,
} from '@/lib/project-preview'
import { SCHEDULE_DATES_NEEDED } from '@/lib/schedule'
import { cn } from '@/lib/utils'

const SECTION_CLASS = 'flex flex-col gap-2.5 px-4 py-3.5'
const HEADING_CLASS = 'text-xs font-semibold text-muted-foreground'
const SHORTCUT_CLASS =
  'relative inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:after:absolute pointer-coarse:after:-inset-1.5'

function PersonRow({ label, person, missing }: { label: string; person: PreviewPerson | null; missing: string }) {
  const phoneHref = person?.phone ? person.phone.replace(/[^0-9+]/g, '') : ''
  return (
    <li className="flex min-w-0 items-center gap-1">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={cn('break-words text-sm', person ? 'font-medium text-foreground' : 'text-muted-foreground')}>
          {person?.name ?? missing}
          {person?.detail && <span className="font-normal text-muted-foreground">{` · ${person.detail}`}</span>}
        </span>
      </span>
      {person && phoneHref.length >= 7 && (
        <a href={`tel:${phoneHref}`} className={SHORTCUT_CLASS} aria-label={`Call ${person.name}`} title={person.phone ?? undefined}>
          <Phone className="size-4" aria-hidden="true" />
        </a>
      )}
      {person?.email && (
        <a href={`mailto:${person.email}`} className={SHORTCUT_CLASS} aria-label={`Email ${person.name}`} title={person.email}>
          <Mail className="size-4" aria-hidden="true" />
        </a>
      )}
    </li>
  )
}

export function PeopleSection({
  people,
  retrying,
  onRetry,
  onViewAll,
  onAssign,
}: {
  people: PreviewPeople
  retrying: boolean
  onRetry: () => void
  onViewAll: () => void
  onAssign: () => void
}) {
  const headingId = useId()
  const subcontractorsId = useId()
  const { homeowners, subcontractors } = people
  const items = subcontractors.state === 'ready' ? subcontractors.items : []

  return (
    <section aria-labelledby={headingId} className={SECTION_CLASS}>
      <h3 id={headingId} tabIndex={-1} data-view-fallback className={cn(HEADING_CLASS, 'outline-none')}>
        People
      </h3>
      <ul className="flex flex-col gap-2">
        <PersonRow label="Project manager" person={people.manager} missing="Unassigned" />
        {homeowners.state === 'ready' ? (
          <>
            <PersonRow label="Primary homeowner" person={homeowners.primary} missing="No homeowner linked" />
            {homeowners.secondary && <PersonRow label="Secondary contact" person={homeowners.secondary} missing="" />}
          </>
        ) : (
          <li role="status" className="text-sm text-warning">
            Homeowner details could not be loaded.
          </li>
        )}
      </ul>
      {homeowners.state === 'ready' && homeowners.otherCount > 0 && (
        <Link href={people.peopleHref} className={cn(PREVIEW_LINK_CLASS, 'text-xs')}>
          {`${homeowners.otherCount} more homeowner ${homeowners.otherCount === 1 ? 'contact' : 'contacts'}`}
        </Link>
      )}

      <div role="group" aria-labelledby={subcontractorsId} className="mt-1 flex flex-col gap-2.5 border-t border-[#D6DDE5]/70 pt-3">
        <div className="flex min-h-8 flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <h4 id={subcontractorsId} className="text-sm font-medium text-foreground">
            Subcontractors
            {subcontractors.state === 'ready' && items.length > 0 && (
              <span className="tabular-nums font-normal text-muted-foreground">{` (${items.length})`}</span>
            )}
          </h4>
          {people.canAssign && (
            <Button type="button" variant="outline" size="sm" className="h-8 pointer-coarse:h-11" data-view-trigger="assign" onClick={onAssign}>
              <UserPlus data-icon="inline-start" />
              Assign subcontractor
            </Button>
          )}
        </div>

        {subcontractors.state === 'error' && (
          <div role="alert" className="flex flex-col items-start gap-2">
            <p className="text-sm text-warning">Assigned subcontractors could not be loaded.</p>
            <Button type="button" variant="outline" size="sm" className="pointer-coarse:h-11" disabled={retrying} onClick={onRetry}>
              {retrying ? (
                <Loader2 data-icon="inline-start" className="animate-spin motion-reduce:animate-none" />
              ) : (
                <RefreshCw data-icon="inline-start" />
              )}
              {retrying ? 'Loading' : 'Try again'}
            </Button>
          </div>
        )}
        {subcontractors.state === 'unavailable' && (
          <p className="text-sm text-muted-foreground">The business directory isn&apos;t set up for this organization yet.</p>
        )}
        {subcontractors.state === 'ready' && items.length === 0 && <p className="text-sm text-muted-foreground">No subcontractors assigned.</p>}
        {items.length > 0 && (
          <ul className="flex flex-col gap-2.5">
            {items.slice(0, PREVIEW_SUBCONTRACTOR_LIMIT).map((entry) => (
              <SubcontractorEntry key={entry.key} entry={entry} />
            ))}
          </ul>
        )}
        {items.length > PREVIEW_SUBCONTRACTOR_LIMIT && (
          <button type="button" data-view-trigger="subcontractors" onClick={onViewAll} className={cn(PREVIEW_LINK_CLASS, 'cursor-pointer')}>
            {`View all (${items.length})`}
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </button>
        )}
        {people.assignNote && <p className="text-xs text-muted-foreground">{people.assignNote}</p>}
      </div>
    </section>
  )
}

const UPCOMING_MESSAGE: Record<Exclude<PreviewNextActivity['state'], 'ready' | 'off' | 'undated'>, string> = {
  error: 'Schedule activities could not be loaded.',
  empty: 'No schedule activities yet.',
  complete: 'All scheduled activities are complete.',
}

function undatedDetail(next: Extract<PreviewNextActivity, { state: 'undated' }>) {
  const count = `${next.openCount} open ${next.openCount === 1 ? 'activity has' : 'activities have'} no planned dates yet.`
  return next.firstName ? `${count} First in the schedule: ${next.firstName}.` : count
}

export function UpcomingWorkSection({ next }: { next: PreviewNextActivity }) {
  const headingId = useId()
  if (next.state === 'off') return null
  return (
    <section aria-labelledby={headingId} className={SECTION_CLASS}>
      <h3 id={headingId} className={HEADING_CLASS}>
        Upcoming work
      </h3>
      {next.state === 'ready' ? (
        <div className="flex min-w-0 flex-col gap-1.5">
          <Link href={next.href} className={cn(PREVIEW_LINK_CLASS, 'break-words')}>
            {next.milestone && <span className="sr-only">Milestone: </span>}
            {next.name}
          </Link>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>{next.plannedLabel}</span>
            <ActivityStatusBadge status={next.status} />
            {next.milestone && <span aria-hidden="true">Milestone</span>}
            {next.overdue && <span className="font-semibold text-destructive">Overdue</span>}
          </div>
          {next.assignedTo && (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <UserRound className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span className="break-words">{`Assigned to ${next.assignedTo}`}</span>
            </p>
          )}
        </div>
      ) : (
        <>
          {next.state === 'undated' ? (
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-medium text-foreground">{SCHEDULE_DATES_NEEDED}</p>
              <p className="break-words text-xs leading-relaxed text-muted-foreground">{undatedDetail(next)}</p>
            </div>
          ) : (
            <p
              role={next.state === 'error' ? 'status' : undefined}
              className={cn('text-sm', next.state === 'error' ? 'text-warning' : 'text-muted-foreground')}
            >
              {UPCOMING_MESSAGE[next.state]}
            </p>
          )}
          <Link href={next.scheduleHref} className={PREVIEW_LINK_CLASS}>
            Open schedule
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </>
      )}
    </section>
  )
}

export function LatestUpdateSection({ update }: { update: PreviewLatestUpdate }) {
  const headingId = useId()
  if (update.state === 'off') return null
  return (
    <section aria-labelledby={headingId} className={SECTION_CLASS}>
      <h3 id={headingId} className={HEADING_CLASS}>
        Latest update
      </h3>
      {update.state === 'error' && (
        <p role="status" className="text-sm text-warning">
          The latest daily log could not be loaded.
        </p>
      )}
      {update.state === 'empty' && <p className="text-sm text-muted-foreground">No daily logs yet.</p>}
      {update.state === 'ready' && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground">{update.dateLabel}</span>
            {update.draft && (
              <span className="rounded-badge bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Draft</span>
            )}
          </div>
          <p className={cn('line-clamp-3 break-words text-sm leading-relaxed', update.summary ? 'text-foreground' : 'text-muted-foreground')}>
            {update.summary ?? 'No notes recorded yet.'}
          </p>
          {update.photos.length > 0 && (
            <ul className="grid grid-cols-3 gap-2">
              {update.photos.map((photo) => (
                <li key={photo.id} className="relative aspect-[4/3] overflow-hidden rounded-md bg-muted">
                  <CoverImage
                    src={photo.url}
                    alt={photo.alt}
                    className="size-full object-cover"
                    fallback={
                      <span className="flex size-full items-center justify-center text-muted-foreground">
                        <ImageOff className="size-4" aria-hidden="true" />
                        <span className="sr-only">Photo unavailable</span>
                      </span>
                    }
                  />
                </li>
              ))}
            </ul>
          )}
          {update.photosFailed && (
            <p role="status" className="text-xs text-warning">
              Some photos could not be loaded.
            </p>
          )}
          {update.morePhotos > 0 && (
            <p className="text-xs text-muted-foreground">
              {`${update.morePhotos} more ${update.morePhotos === 1 ? 'photo' : 'photos'} in this log`}
            </p>
          )}
          <Link href={update.href} className={PREVIEW_LINK_CLASS}>
            View update
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </>
      )}
    </section>
  )
}

/** Shown only when the Questions module is on and something is waiting; an empty list leaves no heading behind. */
export function PendingQuestionsSection({ questions }: { questions: PreviewQuestions }) {
  const headingId = useId()
  if (questions.state === 'off') return null
  const ready = questions.state === 'ready' ? questions : null
  if (ready && ready.items.length === 0) return null
  return (
    <section aria-labelledby={headingId} className={SECTION_CLASS}>
      <h3 id={headingId} className={HEADING_CLASS}>
        Pending questions
      </h3>
      {!ready ? (
        <p role="status" className="text-sm text-warning">
          Questions could not be loaded.
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-2.5">
            {ready.items.map((question) => (
              <li key={question.id} className="flex min-w-0 flex-col gap-0.5">
                <Link
                  href={question.href}
                  className="line-clamp-2 break-words rounded-sm text-sm font-medium text-link outline-none hover:text-link-hover hover:underline focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:py-1.5"
                >
                  {question.subject}
                </Link>
                <span className="break-words text-xs text-muted-foreground">{`${question.ref} · ${question.responsible}`}</span>
                <span className={cn('text-xs', question.overdue ? 'font-semibold text-destructive' : 'text-muted-foreground')}>
                  {question.context}
                </span>
              </li>
            ))}
          </ul>
          {ready.total > ready.items.length && (
            <Link href={ready.href} className={PREVIEW_LINK_CLASS}>
              {`View all ${ready.total} pending questions`}
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          )}
        </>
      )}
    </section>
  )
}
