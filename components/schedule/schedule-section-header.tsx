import type { LucideIcon } from 'lucide-react'

export const SECTION_CARD_CLASS = 'flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-white'

/** Header shared by the lower schedule cards so icon, title and actions line up identically. */
export function SectionCardHeader({
  icon: Icon,
  title,
  titleId,
  description,
  aside,
}: {
  icon: LucideIcon
  title: string
  titleId: string
  description?: React.ReactNode
  aside?: React.ReactNode
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-interactive-soft text-primary">
          <Icon className="size-4" />
        </span>
        <div className="flex min-w-0 flex-col">
          <h2 id={titleId} className="font-serif text-lg font-semibold leading-tight text-brand-deep">
            {title}
          </h2>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
      </div>
      {aside}
    </header>
  )
}
