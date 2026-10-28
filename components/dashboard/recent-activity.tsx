import Link from 'next/link'
import { Activity, Bell, Calendar, Mail, MapPin, Phone, StickyNote } from 'lucide-react'
import { markNotificationReadAction } from '@/app/actions/walkthroughs'
import { ACTIVITY_TYPE_LABELS } from '@/lib/domain'
import { formatDateTime } from '@/lib/format'

type ActivityItem = {
  id: string
  activity_type: string
  summary: string
  created_at: string
  client_id: string
  clients: { first_name: string; last_name: string } | null
}

const ACTIVITY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  note: StickyNote,
  call: Phone,
  email: Mail,
  meeting: Calendar,
  site_visit: MapPin,
}

export type ProjectUpdate = {
  id: string
  title: string
  body: string | null
  link: string | null
  created_at: string
  projectName: string | null
}

function UpdateRow({ update }: { update: ProjectUpdate }) {
  return (
    <li className="relative flex gap-3">
      <span
        className="relative flex size-7 shrink-0 items-center justify-center rounded-full bg-champagne-soft text-champagne-foreground ring-4 ring-card"
        aria-hidden="true"
      >
        <Bell className="size-3.5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5">
        <div className="flex flex-wrap items-center justify-between gap-x-2 text-xs">
          <span className="font-medium text-primary">{update.projectName ?? 'Project update'}</span>
          <time dateTime={update.created_at} className="text-muted-foreground">
            {formatDateTime(update.created_at)}
          </time>
        </div>
        {update.link ? (
          <Link href={update.link} className="text-pretty text-sm leading-relaxed text-foreground hover:text-primary">
            {update.title}
          </Link>
        ) : (
          <p className="text-pretty text-sm leading-relaxed text-foreground">{update.title}</p>
        )}
        {update.body && <p className="line-clamp-2 text-xs text-muted-foreground">{update.body}</p>}
        <form
          action={async () => {
            'use server'
            await markNotificationReadAction(update.id)
          }}
        >
          <button
            type="submit"
            className="min-h-6 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Dismiss
            <span className="sr-only">{`: ${update.title}`}</span>
          </button>
        </form>
      </div>
    </li>
  )
}

export function RecentActivity({ items, updates = [] }: { items: ActivityItem[]; updates?: ProjectUpdate[] }) {
  const entries = [
    ...items.map((item) => ({ type: 'activity' as const, at: item.created_at, item })),
    ...updates.map((update) => ({ type: 'update' as const, at: update.created_at, update })),
  ].sort((a, b) => b.at.localeCompare(a.at))
  return (
    <section aria-labelledby="activity-heading" className="surface flex flex-col gap-5 p-5 md:p-6">
      <div className="flex flex-col gap-1 border-b pb-4">
        <h2 id="activity-heading" className="font-serif text-xl font-semibold tracking-tight text-foreground">
          Recent Activity
        </h2>
        <p className="text-sm text-muted-foreground">Latest client activity and project updates</p>
      </div>
      {entries.length === 0 ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          Client notes, calls, and project events will show here.
        </p>
      ) : (
        <ol className="relative flex flex-col gap-5 before:absolute before:bottom-3 before:left-3.5 before:top-3 before:w-px before:bg-border">
          {entries.map((entry) => {
            if (entry.type === 'update') return <UpdateRow key={`u-${entry.update.id}`} update={entry.update} />
            const item = entry.item
            const Icon = ACTIVITY_ICONS[item.activity_type] ?? Activity
            return (
              <li key={item.id} className="relative flex gap-3">
                <span
                  className="relative flex size-7 shrink-0 items-center justify-center rounded-full bg-sage text-primary ring-4 ring-card"
                  aria-hidden="true"
                >
                  <Icon className="size-3.5" />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5">
                  <div className="flex flex-wrap items-center justify-between gap-x-2 text-xs">
                    <span className="font-medium text-primary">
                      {ACTIVITY_TYPE_LABELS[item.activity_type] ?? item.activity_type}
                    </span>
                    <time dateTime={item.created_at} className="text-muted-foreground">
                      {formatDateTime(item.created_at)}
                    </time>
                  </div>
                  <p className="text-pretty text-sm leading-relaxed text-foreground">{item.summary}</p>
                  {item.clients && (
                    <Link
                      href={`/clients/${item.client_id}`}
                      className="w-fit text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline"
                    >
                      {`${item.clients.first_name} ${item.clients.last_name}`}
                    </Link>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
