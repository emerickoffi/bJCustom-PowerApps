import Link from 'next/link'
import { Bell } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { markNotificationReadAction } from '@/app/actions/walkthroughs'
import { formatDateTime } from '@/lib/format'

export async function NotificationsCard({ userId }: { userId: string }) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('notifications')
    .select('id, title, body, link, created_at')
    .eq('user_id', userId)
    .is('read_at', null)
    .order('created_at', { ascending: false })
    .limit(10)
  const notifications = data ?? []
  if (!notifications.length) return null

  return (
    <section aria-labelledby="notifications-heading" className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-card p-5">
      <h2 id="notifications-heading" className="flex items-center gap-2 font-serif text-lg font-semibold text-foreground">
        <Bell className="size-4 text-primary" aria-hidden="true" />
        {`Needs your attention (${notifications.length})`}
      </h2>
      <ul className="flex flex-col divide-y">
        {notifications.map((n) => (
          <li key={n.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
            <div className="flex min-w-0 flex-col gap-0.5">
              {n.link ? (
                <Link href={n.link} className="text-sm font-medium text-foreground hover:text-primary">
                  {n.title}
                </Link>
              ) : (
                <span className="text-sm font-medium text-foreground">{n.title}</span>
              )}
              {n.body && <span className="truncate text-xs text-muted-foreground">{n.body}</span>}
              <span className="text-xs text-muted-foreground">{formatDateTime(n.created_at)}</span>
            </div>
            <form
              action={async () => {
                'use server'
                await markNotificationReadAction(n.id)
              }}
            >
              <button type="submit" className="shrink-0 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                Dismiss
              </button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  )
}
