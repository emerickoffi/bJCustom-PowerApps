import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export type WorkItem = {
  id: string
  href: string
  title: string
  project: string | null
  status: string
  meta: string
  tone: 'default' | 'attention'
}

export function WorkItemList({
  id,
  icon: Icon,
  title,
  description,
  items,
  emptyText,
}: {
  id: string
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>
  title: string
  description: string
  items: WorkItem[]
  emptyText: string
}) {
  return (
    <section aria-labelledby={id} className="surface flex min-w-0 flex-col gap-4 p-5 md:p-6">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sage text-primary">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-col">
          <h2 id={id} className="font-serif text-lg font-semibold text-foreground">
            {title}
            {items.length > 0 && <span className="ml-2 font-sans text-sm font-medium text-muted-foreground">{items.length}</span>}
          </h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {items.length ? (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={item.href}
                className="group flex min-h-11 items-center justify-between gap-3 rounded-xl border border-border/70 p-3.5 transition-colors hover:border-primary/30 hover:bg-sage/40"
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium text-foreground">{item.title}</span>
                  {item.project && <span className="truncate text-xs text-muted-foreground">{item.project}</span>}
                  <span className={cn('text-xs', item.tone === 'attention' ? 'font-medium text-destructive' : 'text-muted-foreground')}>
                    {item.meta}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full bg-sage px-2.5 py-0.5 text-xs font-medium text-primary">{item.status}</span>
                  <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-input bg-card/70 px-4 py-6 text-center text-sm text-muted-foreground">
          {emptyText}
        </p>
      )}
    </section>
  )
}
