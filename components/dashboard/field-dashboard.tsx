import Link from 'next/link'
import {
  ArrowRight,
  BellRing,
  CalendarDays,
  Camera,
  CheckCircle2,
  ClipboardList,
  FileText,
  FolderKanban,
  HardHat,
  ListChecks,
  MapPin,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DashboardSectionHeader } from '@/components/dashboard/dashboard-section-header'
import { ProjectHealthList } from '@/components/dashboard/project-health'
import { CustomizeDashboard } from '@/components/dashboard/customize-dashboard'
import { FieldContactsButton } from '@/components/dashboard/field-contacts'
import { loadFieldDashboard, type FieldDashboardData } from '@/lib/field-dashboard-data'
import { loadDashboardLayout } from '@/lib/dashboard-layout-data'
import { loadProjectHealth } from '@/lib/dashboard-workspace-data'
import { visibleIn, type DashboardKey, type ResolvedWidget, type WidgetId } from '@/lib/dashboard-layout'
import { isOverdueItem, pickFocus } from '@/lib/field-dashboard'
import { ACTION_CATEGORY_LABELS, type ActionItem } from '@/lib/action-items'
import { ACTIVE_PROJECT_STATUSES, PROJECT_STATUS_LABELS } from '@/lib/domain'
import { LIFECYCLE_GROUP_CLASSES, lifecycleGroup } from '@/lib/project-lifecycle'
import { formatDate } from '@/lib/format'
import { greeting } from '@/lib/greeting'
import { cn } from '@/lib/utils'
import type { FeatureMap } from '@/lib/feature-registry'
import type { StaffSession } from '@/lib/session'

const JOB_ACTION_LIMIT = 5
const TILE =
  'flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl border bg-card p-3 text-sm font-medium shadow-soft transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/**
 * Field-first dashboard for project managers and builder staff. Every widget is scoped to the user's
 * authorized jobs; the selected job comes from the shared job context, re-verified through RLS.
 */
export async function FieldDashboard({
  session,
  features,
  dashboardKey,
}: {
  session: StaffSession
  features: FeatureMap
  dashboardKey: Exclude<DashboardKey, 'owner'>
}) {
  const [data, layout] = await Promise.all([
    loadFieldDashboard(session, features),
    loadDashboardLayout(session.organizationId, session.userId, dashboardKey, features),
  ])
  const wantsHealth = layout.widgets.some((w) => w.id === 'project_health' && w.visible)
  const health = wantsHealth
    ? await loadProjectHealth(
        session.organizationId,
        session.userId,
        data.assignedJobs.filter((j) => ACTIVE_PROJECT_STATUSES.includes(j.status)).map((j) => j.id),
        features,
      )
    : null

  const firstName = session.fullName?.split(' ')[0]
  const main = visibleIn(layout.widgets, 'main')
  const editable = layout.widgets.filter((w) => !w.fixed)

  const render = (w: ResolvedWidget) => {
    const node = renderWidget(w.id, data, { features, session, health })
    if (!node) return null
    return (
      <div key={w.id} className={cn('min-w-0', w.span === 'full' && 'lg:col-span-2')} data-dashboard-widget={w.id}>
        {node}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">{session.brand.displayName}</p>
          <h1 className="font-serif text-2xl font-semibold md:text-3xl">
            {firstName ? `${greeting()}, ${firstName}.` : `${greeting()}.`}
          </h1>
        </div>
        <CustomizeDashboard widgets={editable} customized={layout.customized} />
      </div>

      <CurrentJobCard data={data} />

      {data.job ? (
        <div className="grid items-start gap-5 lg:grid-cols-2">{main.map(render)}</div>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-2">
          {main.filter((w) => w.id === 'assigned_jobs' || w.id === 'project_health').map(render)}
        </div>
      )}
    </div>
  )
}

function renderWidget(
  id: WidgetId,
  data: FieldDashboardData,
  ctx: { features: FeatureMap; session: StaffSession; health: Awaited<ReturnType<typeof loadProjectHealth>> | null },
) {
  switch (id) {
    case 'focus':
      return <FocusCard data={data} />
    case 'quick_actions':
      return <QuickActions data={data} />
    case 'job_actions':
      return <JobActions data={data} />
    case 'assigned_jobs':
      return <AssignedJobs data={data} />
    case 'upcoming_work':
      return <UpcomingWork data={data} />
    case 'job_glance':
      return <JobGlance data={data} />
    case 'job_updates':
      return <JobUpdates data={data} />
    case 'project_health':
      return ctx.health ? (
        <ProjectHealthList
          projects={ctx.health.projects}
          total={ctx.health.total}
          flagged={ctx.health.flagged}
          canSetUpSchedule={ctx.session.role === 'project_manager' && ctx.features.schedule}
        />
      ) : null
    default:
      return null
  }
}

function Panel({ id, title, icon, action, children }: { id: string; title: string; icon: typeof BellRing; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-soft sm:p-5">
      <DashboardSectionHeader id={id} title={title} icon={icon} action={action} />
      {children}
    </section>
  )
}

function StageBadge({ status }: { status: FieldDashboardData['assignedJobs'][number]['status'] }) {
  return (
    <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', LIFECYCLE_GROUP_CLASSES[lifecycleGroup(status)])}>
      {PROJECT_STATUS_LABELS[status] ?? status}
    </span>
  )
}

function CurrentJobCard({ data }: { data: FieldDashboardData }) {
  const job = data.job
  if (!job) {
    return (
      <section aria-labelledby="current-job-heading" className="flex flex-col gap-2 rounded-2xl border border-dashed bg-card p-5">
        <h2 id="current-job-heading" className="font-medium">
          Pick a job to get started
        </h2>
        <p className="text-sm text-muted-foreground">
          {data.assignedJobs.length
            ? 'Use Switch job at the top of the page, or open one of your jobs below. Your choice is remembered.'
            : 'You are not assigned to any active jobs yet. Ask your project manager to add you to a job.'}
        </p>
      </section>
    )
  }
  return (
    <section
      aria-labelledby="current-job-heading"
      className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-soft sm:flex-row sm:items-center sm:justify-between sm:p-5"
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Current job</span>
        <h2 id="current-job-heading" className="truncate font-serif text-xl font-semibold">
          {job.name}
        </h2>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {job.projectNumber && <span>#{job.projectNumber}</span>}
          {job.city && (
            <span className="flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden="true" />
              {job.city}
            </span>
          )}
          <StageBadge status={job.status} />
        </div>
      </div>
      <Button variant="outline" className="min-h-11 shrink-0" render={<Link href={`/projects/${job.id}`} />} nativeButton={false}>
        Open job
        <ArrowRight data-icon="inline-end" />
      </Button>
    </section>
  )
}

function FocusCard({ data }: { data: FieldDashboardData }) {
  const focus = pickFocus(data.jobActions)
  const routine = data.quickActions.find((a) => a.key === 'daily_log')
  if (!focus) {
    return (
      <section aria-labelledby="focus-heading" className="flex flex-col gap-3 rounded-2xl bg-brand-deep p-5 text-white shadow-lift sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-champagne" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <h2 id="focus-heading" className="font-medium">
              Nothing needs you on this job right now
            </h2>
            <p className="text-sm text-white/75">No open action items for {data.job?.name}.</p>
          </div>
        </div>
        {routine?.href && (
          <Button render={<Link href={routine.href} />} nativeButton={false} className="min-h-11 bg-champagne text-white hover:bg-champagne/90">
            <FileText data-icon="inline-start" />
            Add today&apos;s log
          </Button>
        )}
      </section>
    )
  }
  const overdue = isOverdueItem(focus, data.today)
  const severityLabel = focus.severity === 'critical' ? 'Critical' : overdue ? 'Overdue' : focus.severity === 'warning' ? 'Needs attention' : 'Up next'
  return (
    <section aria-labelledby="focus-heading" className="flex flex-col gap-4 rounded-2xl bg-brand-deep p-5 text-white shadow-lift sm:p-6">
      <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
        <span className="uppercase tracking-wide text-champagne">Focus</span>
        <span
          className={cn(
            'rounded-full px-2.5 py-0.5',
            focus.severity === 'critical' || overdue ? 'bg-red-50 text-red-800' : 'bg-white/15 text-white',
          )}
        >
          {severityLabel}
        </span>
        <span className="text-white/65">{ACTION_CATEGORY_LABELS[focus.category]}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <h2 id="focus-heading" className="text-pretty font-serif text-xl font-semibold leading-snug sm:text-2xl">
          {focus.title}
        </h2>
        <p className="text-pretty text-sm leading-relaxed text-white/80">{focus.description}</p>
        {focus.dueDate && (
          <p className="text-sm text-white/80">
            {overdue ? 'Was due' : 'Due'} {formatDate(focus.dueDate)}
          </p>
        )}
      </div>
      <Button render={<Link href={focus.href} />} nativeButton={false} size="lg" className="min-h-12 self-start bg-champagne text-white hover:bg-champagne/90">
        {focus.actionLabel}
        <ArrowRight data-icon="inline-end" />
      </Button>
    </section>
  )
}

function QuickActions({ data }: { data: FieldDashboardData }) {
  if (!data.job || !data.quickActions.length) return null
  const icons = { daily_log: FileText, photos: Camera, punch_list: ListChecks } as const
  return (
    <nav aria-label="Quick actions for this job" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {data.quickActions.map((a) => {
        if (a.key === 'contacts') {
          return <FieldContactsButton key={a.key} contacts={data.contacts} jobName={data.job!.name} className={TILE} />
        }
        const Icon = icons[a.key]
        return (
          <Link key={a.key} href={a.href!} className={TILE}>
            <Icon className="size-6 text-primary" aria-hidden="true" />
            {a.label}
          </Link>
        )
      })}
    </nav>
  )
}

function ActionRow({ item, today }: { item: ActionItem; today: string }) {
  const overdue = isOverdueItem(item, today)
  return (
    <li>
      <Link
        href={item.href}
        className="flex min-h-14 items-start gap-3 rounded-xl px-2 py-2.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          className={cn(
            'mt-1.5 size-2 shrink-0 rounded-full',
            item.severity === 'critical' ? 'bg-red-600' : item.severity === 'warning' ? 'bg-amber-500' : 'bg-primary',
          )}
          aria-hidden="true"
        />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-medium">{item.title}</span>
          <span className="line-clamp-1 text-xs text-muted-foreground">{item.description}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-0.5 text-xs">
          <span className="sr-only">Priority:</span>
          <span className={item.severity === 'critical' ? 'font-medium text-red-700' : 'text-muted-foreground'}>
            {item.severity === 'critical' ? 'Critical' : item.severity === 'warning' ? 'High' : 'Normal'}
          </span>
          {item.dueDate && <span className={overdue ? 'font-medium text-red-700' : 'text-muted-foreground'}>{formatDate(item.dueDate)}</span>}
        </span>
      </Link>
    </li>
  )
}

function JobActions({ data }: { data: FieldDashboardData }) {
  const rest = data.jobActions.slice(1)
  const shown = rest.slice(0, JOB_ACTION_LIMIT)
  return (
    <Panel
      id="job-actions-heading"
      title="On this job"
      icon={BellRing}
      action={
        <Link href="/actions" className="flex min-h-9 items-center rounded-md px-2 text-sm font-medium text-primary hover:bg-muted">
          View all
        </Link>
      }
    >
      {shown.length ? (
        <ul className="-mx-2 flex flex-col">
          {shown.map((item) => (
            <ActionRow key={item.id} item={item} today={data.today} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          {data.jobActions.length ? 'The focus item above is the only open action on this job.' : 'No open action items on this job.'}
        </p>
      )}
      {rest.length > shown.length && (
        <p className="text-xs text-muted-foreground">{rest.length - shown.length} more in the Action Center.</p>
      )}
    </Panel>
  )
}

function AssignedJobs({ data }: { data: FieldDashboardData }) {
  return (
    <Panel
      id="assigned-jobs-heading"
      title="My jobs"
      icon={FolderKanban}
      action={
        <Link href="/projects" className="flex min-h-9 items-center rounded-md px-2 text-sm font-medium text-primary hover:bg-muted">
          All jobs
        </Link>
      }
    >
      {data.assignedJobs.length ? (
        <ul className="-mx-2 flex flex-col">
          {data.assignedJobs.map((j) => (
            <li key={j.id}>
              <Link
                href={`/projects/${j.id}`}
                aria-current={data.job?.id === j.id ? 'true' : undefined}
                className="flex min-h-12 items-center gap-3 rounded-xl px-2 py-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[current=true]:bg-muted"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{j.name}</span>
                  <span className="text-xs text-muted-foreground">{[j.projectNumber && `#${j.projectNumber}`, j.city].filter(Boolean).join(' · ')}</span>
                </span>
                <StageBadge status={j.status} />
                {j.openActions > 0 && (
                  <span className="rounded-full bg-champagne/15 px-2 py-0.5 text-xs font-medium text-foreground">
                    {j.openActions}
                    <span className="sr-only"> open actions</span>
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">You are not assigned to any active jobs.</p>
      )}
    </Panel>
  )
}

function UpcomingWork({ data }: { data: FieldDashboardData }) {
  return (
    <Panel id="upcoming-work-heading" title="Upcoming work" icon={CalendarDays}>
      {data.upcoming.length ? (
        <ul className="-mx-2 flex flex-col">
          {data.upcoming.map((u) => (
            <li key={u.key}>
              <Link href={u.href} className="flex min-h-12 items-center gap-3 rounded-xl px-2 py-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {u.kind === 'punch' ? (
                  <ListChecks className="size-4 shrink-0 text-muted-foreground" aria-label="Punch item" />
                ) : (
                  <HardHat className="size-4 shrink-0 text-muted-foreground" aria-label="Schedule activity" />
                )}
                <span className="min-w-0 flex-1 truncate text-sm">{u.title}</span>
                <span className={cn('shrink-0 text-xs', u.overdue ? 'font-medium text-red-700' : 'text-muted-foreground')}>
                  {u.overdue ? 'Overdue · ' : `${u.dateLabel} `}
                  {formatDate(u.date)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-muted-foreground">No dated activities or punch items coming up on this job.</p>
          {data.job && (
            <Link href={`/projects/${data.job.id}/schedule`} className="text-sm font-medium text-primary hover:underline">
              Open schedule
            </Link>
          )}
        </div>
      )}
    </Panel>
  )
}

function GlanceRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-2 last:border-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-medium">{children}</dd>
    </div>
  )
}

function JobGlance({ data }: { data: FieldDashboardData }) {
  const g = data.glance
  if (!g) return null
  const group = lifecycleGroup(g.status)
  return (
    <Panel id="job-glance-heading" title="Job at a glance" icon={ClipboardList}>
      <dl className="flex flex-col">
        <GlanceRow label="Stage">
          <StageBadge status={g.status} />
        </GlanceRow>
        {group === 'pipeline' && g.proposedStart && <GlanceRow label="Proposed start">{formatDate(g.proposedStart)}</GlanceRow>}
        {group === 'active' && g.targetCompletion && <GlanceRow label="Target completion">{formatDate(g.targetCompletion)}</GlanceRow>}
        {group === 'closed' && g.completionDate && <GlanceRow label="Completed">{formatDate(g.completionDate)}</GlanceRow>}
        {g.homeowner && <GlanceRow label="Homeowner">{g.homeowner.name}</GlanceRow>}
        {g.manager && <GlanceRow label="Project manager">{g.manager.name}</GlanceRow>}
      </dl>
      {group === 'closed' && data.job && (
        <Link href={`/projects/${data.job.id}/warranty`} className="text-sm font-medium text-primary hover:underline">
          View warranty
        </Link>
      )}
    </Panel>
  )
}

function JobUpdates({ data }: { data: FieldDashboardData }) {
  if (!data.job) return null
  return (
    <Panel
      id="job-updates-heading"
      title="Job updates"
      icon={FileText}
      action={
        <Link href={`/projects/${data.job.id}/daily-logs`} className="flex min-h-9 items-center rounded-md px-2 text-sm font-medium text-primary hover:bg-muted">
          All logs
        </Link>
      }
    >
      {data.recentLogs.length ? (
        <ul className="-mx-2 flex flex-col">
          {data.recentLogs.map((l) => (
            <li key={l.id}>
              <Link
                href={`/projects/${data.job!.id}/daily-logs/${l.id}`}
                className="flex min-h-12 flex-col gap-0.5 rounded-xl px-2 py-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  {formatDate(l.logDate)}
                  {l.hasDelays && <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800">Delay reported</span>}
                </span>
                <span className="line-clamp-2 text-sm">{l.summary}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No daily logs on this job yet.</p>
      )}
    </Panel>
  )
}
