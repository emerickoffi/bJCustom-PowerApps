import type { Metadata } from 'next'
import Link from 'next/link'
import { ClipboardCheck, Download } from 'lucide-react'
import { requireManager } from '@/lib/session'
import { requireFeature } from '@/lib/features'
import { formatMoney } from '@/lib/financials'
import { getLaborRates, getTeamMembers, getTimeCalendar, getTimeProjects, listEntries } from '@/lib/time-tracking-data'
import { TIME_STATUSES, addDaysIso, formatMinutes, utcToZoned, weekStart, type TimeStatus } from '@/lib/time-tracking'
import { PageHeader, pageLayout } from '@/components/shared/page-header'
import { NativeSelect } from '@/components/shared/form-field'
import { AutoApplyForm } from '@/components/shared/auto-apply-form'
import { buttonVariants } from '@/components/ui/button'
import { ReviewBoard, type ReviewRow } from '@/components/time/review-board'
import { EntryDialog } from '@/components/time/entry-dialog'
import { StatTile, WeekNav, dayLabel } from '@/components/time/time-shared'

export const metadata: Metadata = { title: 'Approve time' }

const time12 = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

export default async function TimeReviewPage({ searchParams }: { searchParams: Promise<{ week?: string; status?: string; person?: string }> }) {
  const session = await requireManager()
  await requireFeature(session.organizationId, 'time_tracking')
  const sp = await searchParams
  const { timeZone, today, week } = await getTimeCalendar(session.organizationId, sp.week)
  const thisWeek = weekStart(today)
  const status = sp.status === 'all' ? undefined : (TIME_STATUSES as readonly string[]).includes(sp.status ?? '') ? sp.status : 'pending'
  const [projects, team, rates, entries] = await Promise.all([
    getTimeProjects(session.organizationId),
    getTeamMembers(session.organizationId),
    getLaborRates(session.organizationId),
    listEntries({ organizationId: session.organizationId, from: week, to: addDaysIso(week, 6), timeZone }),
  ])
  const names = new Map(team.map((m) => [m.user_id, m.name]))
  const projectName = new Map(projects.map((p) => [p.id, p.name]))
  const person = sp.person && names.has(sp.person) ? sp.person : undefined

  const weekEntries = entries.filter((e) => !person || e.user_id === person)
  const shown = weekEntries.filter((e) => !status || e.status === status)
  const sum = (s?: TimeStatus) => weekEntries.filter((e) => !s || e.status === s).reduce((t, e) => t + (e.worked_minutes ?? 0), 0)
  const approvedCost = weekEntries.filter((e) => e.status === 'approved').reduce((t, e) => t + (e.cost_cents ?? 0), 0)

  const rows: ReviewRow[] = shown.map((e) => {
    const s = utcToZoned(e.started_at, timeZone)
    const end = e.ended_at ? utcToZoned(e.ended_at, timeZone) : null
    const rate = e.hourly_cost_cents ?? rates.get(e.user_id) ?? null
    const cost = e.cost_cents ?? (rate !== null && e.worked_minutes !== null ? Math.round((e.worked_minutes * rate) / 60) : null)
    return {
      id: e.id,
      person: names.get(e.user_id) ?? 'Team member',
      userId: e.user_id,
      day: dayLabel(s.date),
      project: projectName.get(e.project_id) ?? 'Project',
      category: e.cost_category,
      span: `${time12(s.time)} – ${end ? time12(end.time) : 'still clocked in'}`,
      breakMinutes: e.break_minutes,
      minutes: e.worked_minutes ?? 0,
      status: e.status,
      notes: e.notes,
      reviewNote: e.review_note,
      costLabel: cost === null ? null : `${e.cost_cents === null ? '~' : ''}${formatMoney(cost)}`,
      draft: { id: e.id, projectId: e.project_id, category: e.cost_category, date: s.date, start: s.time, end: end?.time ?? s.time, breakMinutes: e.break_minutes, notes: e.notes ?? '', userId: e.user_id },
    }
  })
  const missingRates = [...new Set(shown.filter((e) => e.status !== 'approved' && !rates.has(e.user_id)).map((e) => names.get(e.user_id) ?? 'Team member'))]

  const exportHref = `/api/time/export?from=${week}&to=${addDaysIso(week, 6)}${status ? `&status=${status}` : ''}${person ? `&person=${person}` : ''}`
  const people = team.map((m) => ({ user_id: m.user_id, name: m.name }))

  return (
    <div className={pageLayout('workspace', 'max-w-6xl')}>
      <PageHeader
        icon={ClipboardCheck}
        title="Approve time"
        backHref="/time"
        backLabel="Time"
        actions={
          <>
            {projects.length > 0 && (
              <EntryDialog
                projects={projects}
                people={people}
                draft={{ projectId: projects[0].id, category: 'Other', date: today, start: '07:00', end: '15:30', breakMinutes: 30, notes: '', userId: session.userId }}
              />
            )}
            <a href={exportHref} className={buttonVariants({ variant: 'outline' })}>
              <Download className="size-4" aria-hidden="true" />
              Export CSV
            </a>
          </>
        }
      />

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <WeekNav basePath="/time/review" week={week} thisWeek={thisWeek} params={{ status: sp.status, person }} />
        <AutoApplyForm className="flex flex-wrap gap-2">
          {week !== thisWeek && <input type="hidden" name="week" value={week} />}
          <NativeSelect name="status" defaultValue={status ?? 'all'} aria-label="Status" className="h-9">
            <option value="pending">Awaiting approval</option>
            <option value="approved">Approved</option>
            <option value="rejected">Sent back</option>
            <option value="open">Clocked in now</option>
            <option value="all">All</option>
          </NativeSelect>
          <NativeSelect name="person" defaultValue={person ?? ''} aria-label="Person" className="h-9">
            <option value="">Everyone</option>
            {team.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.name}
              </option>
            ))}
          </NativeSelect>
        </AutoApplyForm>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Hours this week" value={formatMinutes(sum())} />
        <StatTile label="Awaiting approval" value={formatMinutes(sum('pending'))} />
        <StatTile label="Approved" value={formatMinutes(sum('approved'))} />
        <StatTile label="Approved labor cost" value={formatMoney(approvedCost)} hint="counts in job costing" />
      </div>

      <ReviewBoard rows={rows} projects={projects} people={people} missingRates={missingRates} />

      {session.role === 'org_admin' && (
        <p className="text-sm text-muted-foreground">
          Labor cost uses each person&apos;s hourly rate when the time is approved.{' '}
          <Link href="/time/rates" className="font-medium text-primary underline-offset-4 hover:underline">
            Set labor rates
          </Link>
        </p>
      )}
    </div>
  )
}
