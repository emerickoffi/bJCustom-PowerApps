'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { GanttBaseline } from '@/components/schedule/schedule-gantt'
import { CalendarClock, CalendarDays, GanttChart, List, Pencil, Plus } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { ActivityEditor, NewActivitySheet } from '@/components/schedule/activity-editor'
import { ScheduleCalendar, ScheduleTimeline } from '@/components/schedule/schedule-views'
import { ScheduleStageList } from '@/components/schedule/schedule-stage-list'
import type { RelatedIssueLink, ScheduleActivity, ScheduleDependency, SchedulePhase } from '@/lib/schedule'
import { useOpenFromUrl } from '@/components/shared/use-open-from-url'
import { groupByActivity, type ActivityAssignment, type AssignmentAvailability, type CompanyOption } from '@/lib/assignments'

const SCHEDULE_VIEWS = ['list', 'timeline', 'calendar'] as const
type ScheduleView = (typeof SCHEDULE_VIEWS)[number]
const VIEW_KEY = 'schedule:view'

export function ScheduleWorkspace({
  projectId,
  organizationId,
  userId,
  activities,
  phases,
  dependencies,
  conflictIds,
  staffOptions,
  canManage,
  assignmentAvailability = 'off',
  assignments = [],
  relatedIssues = {},
  companies = [],
  acceptsNewAssignments = false,
  initialActivityId = null,
  timeZone,
  baseline = null,
}: {
  timeZone?: string
  baseline?: GanttBaseline | null
  projectId: string
  organizationId: string
  userId: string
  activities: ScheduleActivity[]
  phases: SchedulePhase[]
  dependencies: ScheduleDependency[]
  conflictIds: string[]
  staffOptions: { value: string; label: string }[]
  canManage: boolean
  assignmentAvailability?: AssignmentAvailability
  assignments?: ActivityAssignment[]
  relatedIssues?: Record<string, RelatedIssueLink[]>
  companies?: CompanyOption[]
  acceptsNewAssignments?: boolean
  /** Opens this activity on load (e.g. linked from the dashboard). Ignored when it isn't in this project. */
  initialActivityId?: string | null
}) {
  const assignmentProps = useMemo(
    () => ({
      availability: assignmentAvailability,
      byActivity: groupByActivity(assignments),
      companies,
      acceptsNew: acceptsNewAssignments,
    }),
    [assignmentAvailability, assignments, companies, acceptsNewAssignments],
  )
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    initialActivityId && activities.some((a) => a.id === initialActivityId) ? initialActivityId : null,
  )
  const [selectionProject, setSelectionProject] = useState(projectId)
  if (selectionProject !== projectId) {
    setSelectionProject(projectId)
    setSelectedId(null)
  }
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const linkedActivityId = searchParams.get('activity')
  // A deep link opens its activity once, then the param is dropped so closing, refreshing, or Back doesn't reopen it.
  useEffect(() => {
    if (!linkedActivityId) return
    if (activities.some((a) => a.id === linkedActivityId)) setSelectedId(linkedActivityId)
    const next = new URLSearchParams(searchParams.toString())
    next.delete('activity')
    const query = next.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }, [linkedActivityId, activities, pathname, router, searchParams])
  const [creating, setCreating] = useState(false)
  const [view, setView] = useState<ScheduleView>('list')
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(VIEW_KEY)
      if (saved && (SCHEDULE_VIEWS as readonly string[]).includes(saved)) setView(saved as ScheduleView)
    } catch {}
  }, [])
  const changeView = (value: unknown) => {
    if (!(SCHEDULE_VIEWS as readonly unknown[]).includes(value)) return
    setView(value as ScheduleView)
    try {
      window.localStorage.setItem(VIEW_KEY, value as string)
    } catch {}
  }
  const conflicts = useMemo(() => new Set(conflictIds), [conflictIds])
  const names = useMemo(() => new Map(staffOptions.map((s) => [s.value, s.label])), [staffOptions])
  const nameFor = useCallback((id: string | null) => (id ? (names.get(id) ?? 'Former team member') : null), [names])
  const selected = activities.find((a) => a.id === selectedId) ?? null
  const closeNew = useCallback(() => setCreating(false), [])
  const openNew = useCallback(() => setCreating(true), [])
  useOpenFromUrl('new', 'activity', canManage, openNew)

  const viewProps = {
    activities,
    dependencies,
    conflictIds: conflicts,
    nameFor,
    onSelect: (a: ScheduleActivity) => setSelectedId(a.id),
  }
  const onSelectFirst = (a: ScheduleActivity | undefined) => a && setSelectedId(a.id)

  const notStarted =
    activities.length > 0 &&
    activities.every(
      (a) =>
        !a.planned_start && !a.planned_end && !a.actual_start && !a.actual_end && Number(a.percent_complete) === 0 && a.status !== 'completed',
    )
  const triggerClass =
    'h-full min-h-11 flex-1 rounded-lg px-3.5 text-foreground hover:bg-interactive-soft hover:text-interactive-strong data-active:bg-interactive data-active:text-white data-active:shadow-sm data-active:hover:bg-interactive-hover sm:min-h-0 sm:flex-none'

  return (
    <>
      {notStarted && (
        <section
          aria-labelledby="schedule-not-started"
          className="flex flex-col gap-3 rounded-xl border border-border bg-interactive-soft p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
        >
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-primary" aria-hidden="true">
              <CalendarClock className="size-4" />
            </span>
            <div className="flex flex-col gap-0.5">
              <h2 id="schedule-not-started" className="type-section-title text-brand-deep">
                Scheduling hasn&apos;t started yet
              </h2>
              <p className="text-sm text-brand-deep/70">
                {canManage
                  ? 'The activities are in place but none has dates yet. Open an activity to set its planned dates, or add activities this home needs.'
                  : 'The activities are in place, but a project manager hasn’t set planned dates yet.'}
              </p>
            </div>
          </div>
          {canManage && (
            <Button variant="outline" className="min-h-11 shrink-0 bg-white sm:min-h-9" onClick={() => onSelectFirst(activities[0])}>
              <Pencil data-icon="inline-start" />
              Set first activity&apos;s dates
            </Button>
          )}
        </section>
      )}
      <Tabs value={view} onValueChange={changeView} className="gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList aria-label="Schedule view" className="h-12 w-full rounded-xl border border-border bg-[#F8F7F3] p-1 sm:h-11 sm:w-fit">
            <TabsTrigger value="list" className={triggerClass}>
              <List />
              List
            </TabsTrigger>
            <TabsTrigger value="timeline" className={triggerClass}>
              <GanttChart />
              Gantt
            </TabsTrigger>
            <TabsTrigger value="calendar" className={triggerClass}>
              <CalendarDays />
              Calendar
            </TabsTrigger>
          </TabsList>
          {canManage && (
            <Button className="min-h-11 sm:min-h-9" onClick={() => setCreating(true)}>
              <Plus data-icon="inline-start" />
              Add activity
            </Button>
          )}
        </div>
        <TabsContent value="list">
          <ScheduleStageList
            projectId={projectId}
            organizationId={organizationId}
            userId={userId}
            focusActivityId={selectedId}
            phases={phases}
            activities={activities}
            conflictIds={conflicts}
            nameFor={nameFor}
            onSelect={viewProps.onSelect}
            canManage={canManage}
          />
        </TabsContent>
        <TabsContent value="timeline" keepMounted>
          <ScheduleTimeline
            {...viewProps}
            selectedId={selectedId}
            canManage={canManage}
            timeZone={timeZone}
            assignmentsByActivity={assignmentProps.byActivity}
            baseline={baseline}
          />
        </TabsContent>
        <TabsContent value="calendar">
          <ScheduleCalendar {...viewProps} />
        </TabsContent>
      </Tabs>
      <ActivityEditor
        projectId={projectId}
        phases={phases}
        activity={selected}
        activities={activities}
        dependencies={dependencies}
        staffOptions={staffOptions}
        canManage={canManage}
        assignments={assignmentProps}
        relatedIssues={selected ? relatedIssues[selected.id] ?? [] : []}
        onClose={() => setSelectedId(null)}
      />
      {canManage && <NewActivitySheet projectId={projectId} phases={phases} open={creating} onClose={closeNew} />}
    </>
  )
}
