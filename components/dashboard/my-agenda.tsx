'use client'

import Link from 'next/link'
import { CalendarDays, CalendarOff } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ACTIVITY_TYPE_LABELS, type ActivityType } from '@/lib/schedule'
import type { Agenda, AgendaEntry } from '@/lib/agenda'
import { cn } from '@/lib/utils'

const DAY_FORMAT = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
const VISIBLE = 6

const KIND_LABEL: Record<AgendaEntry['kind'], string> = { due: 'Due', starts: 'Starts', ongoing: 'In progress' }

function dayLabel(iso: string, today: string) {
  return iso === today ? 'Today' : DAY_FORMAT.format(new Date(`${iso}T00:00:00Z`))
}

function AgendaList({ entries, today, emptyText }: { entries: AgendaEntry[]; today: string; emptyText: string }) {
  if (entries.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground" role="status">
        <CalendarOff className="size-4 shrink-0" aria-hidden="true" />
        {emptyText}
      </div>
    )
  }
  const visible = entries.slice(0, VISIBLE)
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y">
        {visible.map((e) => (
          <li key={`${e.id}-${e.date}`}>
            <Link
              href={`/projects/${e.project_id}/schedule`}
              className="group flex items-start gap-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <time
                dateTime={e.date}
                className={cn(
                  'w-16 shrink-0 pt-0.5 text-xs font-semibold tabular-nums',
                  e.date === today ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                {dayLabel(e.date, today)}
              </time>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-medium text-foreground group-hover:text-primary">{e.name}</span>
                <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                  {e.projectName && <span className="truncate">{e.projectName}</span>}
                  {e.projectName && <span aria-hidden="true">·</span>}
                  <span>{ACTIVITY_TYPE_LABELS[e.activity_type as ActivityType] ?? 'Activity'}</span>
                </span>
              </div>
              <span
                className={cn(
                  'shrink-0 rounded-full px-2 py-0.5 text-[0.7rem] font-medium',
                  e.status === 'delayed'
                    ? 'bg-destructive/8 text-destructive'
                    : e.kind === 'due'
                      ? 'bg-champagne-soft text-warning'
                      : 'bg-sage text-primary',
                )}
              >
                {e.status === 'delayed' ? 'Delayed' : KIND_LABEL[e.kind]}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {entries.length > VISIBLE && (
        <Link href="/schedule" className="text-sm font-medium text-primary hover:underline">
          {`View all ${entries.length} on the schedule`}
        </Link>
      )}
    </div>
  )
}

export function MyAgenda({
  agenda,
  today,
  scheduleEnabled,
}: {
  agenda: Agenda
  today: string
  scheduleEnabled: boolean
}) {
  return (
    <section aria-labelledby="agenda-heading" className="surface flex flex-col gap-4 p-5 md:p-6">
      <div className="flex items-start gap-3 border-b pb-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sage text-primary" aria-hidden="true">
          <CalendarDays className="size-5" />
        </span>
        <div className="flex flex-col gap-1">
          <h2 id="agenda-heading" className="font-serif text-xl font-semibold tracking-tight text-foreground">
            My Agenda
          </h2>
          <p className="text-sm text-muted-foreground">Scheduled work on your projects</p>
        </div>
      </div>
      {!scheduleEnabled ? (
        <p className="rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">
          The Schedule module is turned off for your organization, so there is no agenda to show.
        </p>
      ) : (
        <Tabs defaultValue="today" className="flex flex-col gap-3">
          <TabsList aria-label="Agenda range">
            <TabsTrigger value="today">{`Today (${agenda.today.length})`}</TabsTrigger>
            <TabsTrigger value="week">{`This Week (${agenda.week.length})`}</TabsTrigger>
          </TabsList>
          <TabsContent value="today">
            <AgendaList entries={agenda.today} today={today} emptyText="Nothing scheduled for today." />
          </TabsContent>
          <TabsContent value="week">
            <AgendaList entries={agenda.week} today={today} emptyText="Nothing scheduled in the next 7 days." />
          </TabsContent>
        </Tabs>
      )}
    </section>
  )
}
