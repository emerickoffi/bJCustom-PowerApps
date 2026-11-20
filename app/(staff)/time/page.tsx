import type { Metadata } from 'next'
import Link from 'next/link'
import { ClipboardCheck, Clock, Wallet } from 'lucide-react'
import { requireStaff, canManage } from '@/lib/session'
import { requireFeature } from '@/lib/features'
import { getOpenEntry, getTimeCalendar, getTimeProjects, listEntries, countPendingForReview } from '@/lib/time-tracking-data'
import { addDaysIso, formatMinutes, utcToZoned, weekStart, type TimeEntry } from '@/lib/time-tracking'
import { PageHeader, pageLayout } from '@/components/shared/page-header'
import { buttonVariants } from '@/components/ui/button'
import { ClockCard } from '@/components/time/clock-card'
import { DeleteEntryButton, EntryDialog } from '@/components/time/entry-dialog'
import { StatTile, TimeStatusBadge, WeekNav, dayLabel } from '@/components/time/time-shared'

export const metadata: Metadata = { title: 'Time' }

const time12 = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

export default async function TimePage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const session = await requireStaff()
  await requireFeature(session.organizationId, 'time_tracking')
  const { week: requested } = await searchParams
  const { timeZone, today, week } = await getTimeCalendar(session.organizationId, requested)
  const thisWeek = weekStart(today)
  const manager = canManage(session.role)

  const [projects, open, entries, pendingForReview] = await Promise.all([
    getTimeProjects(session.organizationId),
    getOpenEntry(session.userId),
    listEntries({ organizationId: session.organizationId, from: week, to: addDaysIso(week, 6), timeZone, userId: session.userId }),
    manager ? countPendingForReview(session.organizationId) : Promise.resolve(0),
  ])
  const projectName = new Map(projects.map((p) => [p.id, p.name]))

  const closed = entries.filter((e) => e.status !== 'open')
  const sum = (list: TimeEntry[]) => list.reduce((t, e) => t + (e.worked_minutes ?? 0), 0)
  const days = new Map<string, TimeEntry[]>()
  for (const e of closed) {
    const d = utcToZoned(e.started_at, timeZone).date
    days.set(d, [...(days.get(d) ?? []), e])
  }

  const openClock = open
    ? {
        started_at: open.started_at,
        project_name: projectName.get(open.project_id) ?? 'Project',
        cost_category: open.cost_category,
        started_label: time12(utcToZoned(open.started_at, timeZone).time),
      }
    : null

  const blank = { projectId: projects[0]?.id ?? '', category: 'Other', date: today, start: '07:00', end: '15:30', breakMinutes: 30, notes: '' }

  return (
    <div className={pageLayout('workspace', 'max-w-5xl')}>
      <PageHeader
        icon={Clock}
        title="Time"
        actions={
          <>
            {manager && (
              <Link href="/time/review" className={buttonVariants({ variant: 'outline' })}>
                <ClipboardCheck className="size-4" aria-hidden="true" />
                Approve time{pendingForReview ? ` (${pendingForReview})` : ''}
              </Link>
            )}
            {session.role === 'org_admin' && (
              <Link href="/time/rates" className={buttonVariants({ variant: 'ghost' })}>
                <Wallet className="size-4" aria-hidden="true" />
                Labor rates
              </Link>
            )}
          </>
        }
      />

      <ClockCard projects={projects} open={openClock} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="type-section-title text-foreground">My time</h2>
        <div className="flex flex-wrap items-center gap-2">
          <WeekNav basePath="/time" week={week} thisWeek={thisWeek} />
          {projects.length > 0 && <EntryDialog projects={projects} draft={blank} />}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="This week" value={formatMinutes(sum(closed))} />
        <StatTile label="Approved" value={formatMinutes(sum(closed.filter((e) => e.status === 'approved')))} />
        <StatTile label="Awaiting approval" value={formatMinutes(sum(closed.filter((e) => e.status === 'pending')))} />
        <StatTile label="Needs changes" value={String(closed.filter((e) => e.status === 'rejected').length)} hint="entries" />
      </div>

      {days.size === 0 ? (
        <p className="surface p-6 text-center text-sm text-muted-foreground">No time recorded this week.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {[...days.entries()].map(([day, list]) => (
            <section key={day} aria-label={dayLabel(day)} className="surface flex flex-col p-0">
              <header className="flex items-center justify-between border-b px-4 py-3 md:px-5">
                <h3 className="text-sm font-semibold text-foreground">{dayLabel(day)}</h3>
                <span className="text-sm font-medium tabular-nums text-foreground">{formatMinutes(sum(list))}</span>
              </header>
              <ul className="divide-y">
                {list.map((e) => {
                  const s = utcToZoned(e.started_at, timeZone)
                  const end = e.ended_at ? utcToZoned(e.ended_at, timeZone) : null
                  const editable = e.status === 'pending' || e.status === 'rejected'
                  return (
                    <li key={e.id} className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between md:px-5">
                      <div className="flex min-w-0 flex-col gap-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {projectName.get(e.project_id) ?? 'Project'} <span className="font-normal text-muted-foreground">· {e.cost_category}</span>
                        </p>
                        <p className="text-xs tabular-nums text-muted-foreground">
                          {time12(s.time)} – {end ? time12(end.time) : '…'}
                          {e.break_minutes ? ` · ${e.break_minutes} min break` : ''}
                          {e.source === 'manual' ? ' · entered by hand' : ''}
                        </p>
                        {e.notes && <p className="text-sm text-muted-foreground">{e.notes}</p>}
                        {e.status === 'rejected' && e.review_note && (
                          <p className="rounded-lg bg-destructive/5 px-3 py-2 text-sm text-foreground">Manager: {e.review_note}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <TimeStatusBadge status={e.status} />
                        <span className="w-16 text-right text-sm font-semibold tabular-nums text-foreground">{formatMinutes(e.worked_minutes)}</span>
                        {editable && (
                          <>
                            <EntryDialog
                              trigger="edit"
                              projects={projects.some((p) => p.id === e.project_id) ? projects : [{ id: e.project_id, name: projectName.get(e.project_id) ?? 'Project', project_number: null }, ...projects]}
                              draft={{ id: e.id, projectId: e.project_id, category: e.cost_category, date: s.date, start: s.time, end: end?.time ?? s.time, breakMinutes: e.break_minutes, notes: e.notes ?? '' }}
                            />
                            <DeleteEntryButton id={e.id} />
                          </>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Times are shown in your company&apos;s time zone ({timeZone}).
      </p>
    </div>
  )
}
