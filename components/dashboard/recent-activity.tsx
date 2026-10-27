import Link from 'next/link'
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

export function RecentActivity({ items }: { items: ActivityItem[] }) {
  return (
    <section aria-labelledby="activity-heading" className="surface flex flex-col gap-5 p-5 md:p-6">
      <h2 id="activity-heading" className="font-serif text-xl font-semibold tracking-tight text-foreground">
        Recent activity
      </h2>
      {items.length === 0 ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          Client notes, calls, and project events will show here.
        </p>
      ) : (
        <ol className="relative flex flex-col gap-5 before:absolute before:bottom-2 before:left-[0.3125rem] before:top-2 before:w-px before:bg-border">
          {items.map((item) => (
            <li key={item.id} className="relative flex flex-col gap-1 pl-6">
              <span
                className="absolute left-0 top-1.5 size-2.5 rounded-full border-2 border-card bg-primary ring-2 ring-sage"
                aria-hidden="true"
              />
              <div className="flex flex-wrap items-center justify-between gap-x-2 text-xs text-muted-foreground">
                <span className="font-medium text-primary">
                  {ACTIVITY_TYPE_LABELS[item.activity_type] ?? item.activity_type}
                </span>
                <time dateTime={item.created_at}>{formatDateTime(item.created_at)}</time>
              </div>
              <p className="text-sm leading-relaxed text-foreground">{item.summary}</p>
              {item.clients && (
                <Link
                  href={`/clients/${item.client_id}`}
                  className="w-fit text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline"
                >
                  {`${item.clients.first_name} ${item.clients.last_name}`}
                </Link>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
