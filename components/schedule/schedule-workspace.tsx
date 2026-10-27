'use client'

import { useCallback, useMemo, useState } from 'react'
import { CalendarDays, GanttChart, List, Plus } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { ActivityEditor, NewActivitySheet } from '@/components/schedule/activity-editor'
import { ScheduleCalendar, ScheduleList, ScheduleTimeline } from '@/components/schedule/schedule-views'
import type { ScheduleActivity, ScheduleDependency } from '@/lib/schedule'

export function ScheduleWorkspace({
  projectId,
  activities,
  dependencies,
  conflictIds,
  staffOptions,
  canManage,
}: {
  projectId: string
  activities: ScheduleActivity[]
  dependencies: ScheduleDependency[]
  conflictIds: string[]
  staffOptions: { value: string; label: string }[]
  canManage: boolean
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const conflicts = useMemo(() => new Set(conflictIds), [conflictIds])
  const names = useMemo(() => new Map(staffOptions.map((s) => [s.value, s.label])), [staffOptions])
  const nameFor = useCallback((id: string | null) => (id ? (names.get(id) ?? 'Former team member') : null), [names])
  const selected = activities.find((a) => a.id === selectedId) ?? null
  const closeNew = useCallback(() => setCreating(false), [])

  const viewProps = {
    activities,
    dependencies,
    conflictIds: conflicts,
    nameFor,
    onSelect: (a: ScheduleActivity) => setSelectedId(a.id),
  }

  return (
    <>
      <Tabs defaultValue="list" className="gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList className="h-10">
            <TabsTrigger value="list" className="px-3">
              <List />
              List
            </TabsTrigger>
            <TabsTrigger value="timeline" className="px-3">
              <GanttChart />
              Timeline
            </TabsTrigger>
            <TabsTrigger value="calendar" className="px-3">
              <CalendarDays />
              Calendar
            </TabsTrigger>
          </TabsList>
          {canManage && (
            <Button onClick={() => setCreating(true)}>
              <Plus data-icon="inline-start" />
              Add activity
            </Button>
          )}
        </div>
        <TabsContent value="list">
          <ScheduleList {...viewProps} />
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
        onClose={() => setSelectedId(null)}
      />
      {canManage && <NewActivitySheet projectId={projectId} open={creating} onClose={closeNew} />}
    </>
  )
}
