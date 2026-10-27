import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { CalendarDays, CheckCircle2, Circle, CircleDot, AlertTriangle } from 'lucide-react'
import { PageHeader, EmptyState } from '@/components/shared/page-header'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { ProgressBar } from '@/components/schedule/schedule-badges'
import type { ActivityStatus } from '@/lib/schedule'
import { formatDate } from '@/lib/format'

export const metadata: Metadata = { title: 'Construction timeline' }

type PublishedActivity = {
  id: string
  phase: string
  name: string
  activity_type: string
  planned_start: string | null
  planned_end: string | null
  actual_start: string | null
  actual_end: string | null
  percent_complete: number
  status: ActivityStatus
  public_note: string | null
}

type PortalProject = { id: string; name: string; progress_percent: number; target_completion_date: string | null }

export default async function HomeownerSchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) redirect('/auth/login')
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()

  const supabase = await createClient()
  const { data: projects } = await supabase.rpc('get_portal_projects')
  const project = ((projects ?? []) as PortalProject[]).find((p) => p.id === id)
  if (!project) notFound()

  const { data, error } = await supabase.rpc('get_published_schedule', { p_project: id })
  if (error) notFound()
  const items = (data ?? []) as PublishedActivity[]

  const current = items.find((a) => a.status === 'in_progress' || a.status === 'delayed') ?? items.find((a) => a.status !== 'completed')
  const completed = items.filter((a) => a.status === 'completed').length
  const expected = items.reduce<string | null>((max, a) => {
    const d = a.actual_end ?? a.planned_end
    return d && (!max || d > max) ? d : max
  }, null)
  const updates = items.filter((a) => a.public_note || a.status === 'delayed')

  const phases: { phase: string; items: PublishedActivity[] }[] = []
  for (const a of items) {
    const last = phases[phases.length - 1]
    if (last?.phase === a.phase) last.items.push(a)
    else phases.push({ phase: a.phase, items: [a] })
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        icon={CalendarDays}
        backHref="/portal"
        backLabel="Your home"
        title="Construction timeline"
        description={project.name}
      />

      {items.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Your schedule is being prepared"
          description="Your builder is preparing the construction schedule. It will appear here once it's published."
        />
      ) : (
        <>
          <section aria-label="Summary" className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-3 rounded-xl border bg-card p-5">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Overall progress</span>
              {project.progress_percent === null ? (
                <span className="text-sm text-muted-foreground">Your builder hasn&apos;t configured progress tracking yet.</span>
              ) : (
                <>
                  <span className="font-serif text-3xl font-semibold tabular-nums text-foreground">{`${Math.round(Number(project.progress_percent))}%`}</span>
                  <ProgressBar value={Number(project.progress_percent)} label="Overall progress" />
                </>
              )}
            </div>
            <div className="flex flex-col gap-1 rounded-xl border bg-card p-5">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Current stage</span>
              <span className="font-serif text-xl font-semibold text-foreground">{current?.name ?? 'Complete'}</span>
              <span className="text-xs text-muted-foreground">{`${completed} of ${items.length} stages complete`}</span>
            </div>
            <div className="flex flex-col gap-1 rounded-xl border bg-card p-5">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Expected completion</span>
              <span className="font-serif text-xl font-semibold text-foreground">{formatDate(expected ?? project.target_completion_date)}</span>
              <span className="text-xs text-muted-foreground">Based on the current schedule</span>
            </div>
          </section>

          {updates.length > 0 && (
            <section aria-labelledby="updates" className="flex flex-col gap-3 rounded-xl border bg-card p-5">
              <h2 id="updates" className="font-serif text-lg font-semibold text-foreground">
                Schedule updates
              </h2>
              <ul className="flex flex-col gap-3">
                {updates.map((a) => (
                  <li key={a.id} className="flex gap-3 text-sm">
                    {a.status === 'delayed' ? (
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-label="Delayed" />
                    ) : (
                      <CircleDot className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                    )}
                    <span className="flex flex-col gap-0.5">
                      <span className="font-medium text-foreground">{a.status === 'delayed' ? `${a.name} is delayed` : a.name}</span>
                      <span className="text-muted-foreground">{a.public_note ?? 'Your builder will share revised dates soon.'}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="stages" className="flex flex-col gap-4">
            <h2 id="stages" className="font-serif text-lg font-semibold text-foreground">
              Stages
            </h2>
            <ol className="flex flex-col gap-6">
              {phases.map((group) => (
                <li key={group.phase} className="flex flex-col gap-2">
                  <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{group.phase}</h3>
                  <ol className="flex flex-col divide-y rounded-xl border bg-card">
                    {group.items.map((a) => {
                      const done = a.status === 'completed'
                      const isCurrent = a.id === current?.id
                      return (
                        <li key={a.id} className={cn('flex items-start gap-3 p-4', isCurrent && 'bg-primary/5')}>
                          {done ? (
                            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" aria-label="Completed" />
                          ) : isCurrent ? (
                            <CircleDot className="mt-0.5 size-5 shrink-0 text-primary" aria-label="Current stage" />
                          ) : (
                            <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-label="Upcoming" />
                          )}
                          <div className="flex min-w-0 flex-1 flex-col gap-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className={cn('text-sm font-medium', done ? 'text-muted-foreground' : 'text-foreground')}>{a.name}</span>
                              <span className="text-xs tabular-nums text-muted-foreground">
                                {done
                                  ? `Completed ${formatDate(a.actual_end)}`
                                  : a.planned_end
                                    ? `Expected ${formatDate(a.planned_end)}`
                                    : 'Date to be confirmed'}
                              </span>
                            </div>
                            {isCurrent && !done && (
                              <ProgressBar value={Number(a.percent_complete)} label={`${a.name} progress`} className="max-w-xs" />
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </div>
  )
}
