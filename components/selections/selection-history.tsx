import { formatDateTime } from '@/lib/format'
import { EVENT_LABELS, type SelectionEvent } from '@/lib/selections'

export function SelectionHistory({ events, showInternal }: { events: SelectionEvent[]; showInternal: boolean }) {
  const visible = showInternal ? events : events.filter((e) => !e.internal)
  if (visible.length === 0) return <p className="text-sm text-muted-foreground">No activity yet.</p>
  return (
    <ol className="flex flex-col gap-4 border-l pl-4">
      {visible.map((e) => (
        <li key={e.id} className="relative flex flex-col gap-0.5">
          <span className="absolute -left-[21px] top-1.5 size-2.5 rounded-full border-2 border-card bg-primary" aria-hidden="true" />
          <span className="text-sm font-medium text-foreground">
            {EVENT_LABELS[e.event] ?? e.event.replace(/_/g, ' ')}
            {e.internal && showInternal && <span className="ml-2 text-xs font-normal text-muted-foreground">(internal)</span>}
          </span>
          <span className="text-xs text-muted-foreground">
            {[e.actor_name ?? (e.actor_kind === 'system' ? 'System' : null), formatDateTime(e.created_at)].filter(Boolean).join(' · ')}
          </span>
          {e.note && <p className="mt-1 whitespace-pre-line text-pretty text-sm leading-relaxed text-foreground">{e.note}</p>}
        </li>
      ))}
    </ol>
  )
}
