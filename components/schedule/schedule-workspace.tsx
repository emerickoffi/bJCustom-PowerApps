'use client'

import { useCallback, useMemo, useState } from 'react'
import { CalendarClock, CalendarDays, GanttChart, List, Pencil, Plus } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { ActivityEditor, NewActivitySheet } from '@/components/schedule/activity-editor'
import { ScheduleCalendar, ScheduleTimeline } from '@/components/schedule/schedule-views'
import { ScheduleStageList } from '@/components/schedule/schedule-stage-list'
import type { ScheduleActivity, ScheduleDependency } from '@/lib/schedule'
import { useOpenFromUrl } from '@/components/shared/use-open-from-url'
import { groupByActivity, type ActivityAssignment, type AssignmentAvailability, type CompanyOption } from '@/lib/assignments'

export function ScheduleWorkspace({
  projectId,
  activities,
  dependencies,
  conflictIds,
  staffOptions,
  canManage,
  assignmentAvailability = 'off',
  assignments = [],
  companies = [],
}: {
  projectId: string
  activities: ScheduleActivity[]
  dependencies: ScheduleDependency[]
  conflictIds: string[]
  staffOptions: { value: string; label: string }[]
  canManage: boolean
  assignmentAvailability?: AssignmentAvailability
  assignments?: ActivityAssignment[]
  companies?: CompanyOption[]
}) {
  const assignmentProps = useMemo(
    () => ({ availability: assignmentAvailability, byActivity: groupByActivity(assignments), companies }),
    [assignmentAvailability, assignments, companies],
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
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
    'h-full min-h-11 flex-1 rounded-lg px-3.5 text-[#103B27]/70 hover:text-[#103B27] data-active:bg-[#174D32] data-active:text-white data-active:shadow-sm sm:min-h-0 sm:flex-none'

  return (
    <>
      {notStarted && (
        <section
          aria-labelledby="schedule-not-started"
          className="flex flex-col gap-3 rounded-xl border border-[#E2E8E2] bg-[#EAF0E9] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
        >
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-[#174D32]" aria-hidden="true">
              <CalendarClock className="size-4" />
            </span>
            <div className="flex flex-col gap-0.5">
              <h2 id="schedule-not-started" className="font-serif text-base font-semibold text-[#103B27]">
                Scheduling hasn&apos;t started yet
              </h2>
              <p className="text-sm text-[#103B27]/70">
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
      <Tabs defaultValue="list" className="gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList aria-label="Schedule view" className="h-12 w-full rounded-xl border border-[#E2E8E2] bg-[#F8F7F3] p-1 sm:h-11 sm:w-fit">
            <TabsTrigger value="list" className={triggerClass}>
              <List />
              List
            </TabsTrigger>
            <TabsTrigger value="timeline" className={triggerClass}>
              <GanttChart />
              Timeline
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
            activities={activities}
            conflictIds={conflicts}
            nameFor={nameFor}
            onSelect={viewProps.onSelect}
            canManage={canManage}
          />
        </TabsContent>
        <TabsContent value="timeline">
          <ScheduleTimeline {...viewProps} />
        </TabsContent>
        <TabsContent value="calendar">
          <ScheduleCalendar {...viewProps} />
        </TabsContent>
      </Tabs>
      <ActivityEditor
        projectId={projectId}
        activity={selected}
        activities={activities}
        dependencies={dependencies}
        staffOptions={staffOptions}
        canManage={canManage}
        assignments={assignmentProps}
        onClose={() => setSelectedId(null)}
      />
      {canManage && <NewActivitySheet projectId={projectId} open={creating} onClose={closeNew} />}
    </>
  )
}
