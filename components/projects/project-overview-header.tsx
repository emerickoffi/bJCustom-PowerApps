import type { ReactNode } from 'react'
import { CalendarClock, UserRound, type LucideIcon } from 'lucide-react'
import { CoverImage } from '@/components/projects/cover-image'

function HeaderFact({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Icon className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words font-medium text-foreground">{value}</dd>
    </div>
  )
}

/**
 * Overview's page heading. Project name, ID, status and address sit directly above every tab (header selector
 * and project facts row), so this card carries only what they don't: photo, manager, key date, warnings, actions.
 */
export function ProjectOverviewHeader({
  managerName,
  dateLabel,
  dateValue,
  cover,
  badges,
  actions,
}: {
  managerName: string | null
  dateLabel: string
  dateValue: string
  cover: { src: string; alt: string } | null
  badges?: ReactNode
  actions?: ReactNode
}) {
  return (
    <section aria-labelledby="project-heading" className="surface flex flex-col gap-4 p-4 sm:p-5 xl:flex-row xl:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        {cover && (
          <div className="relative hidden size-16 shrink-0 overflow-hidden rounded-xl bg-[#F3F4F6] ring-1 ring-[#D6DDE5] sm:block">
            <CoverImage src={cover.src} alt={cover.alt} className="absolute inset-0 size-full object-cover" fallback={null} priority />
          </div>
        )}
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h1 id="project-heading" className="type-page-title text-foreground">
              Overview
            </h1>
            {badges}
          </div>
          <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <HeaderFact icon={UserRound} label="Project manager" value={managerName ?? 'Not assigned'} />
            <HeaderFact icon={CalendarClock} label={dateLabel} value={dateValue} />
          </dl>
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2 xl:shrink-0 xl:justify-end">{actions}</div>}
    </section>
  )
}

export function HeaderBadge({ tone = 'neutral', children }: { tone?: 'neutral' | 'warning'; children: ReactNode }) {
  return (
    <span
      className={
        tone === 'warning'
          ? 'inline-flex items-center gap-1 rounded-badge bg-champagne-soft px-2.5 py-0.5 text-xs font-medium text-warning'
          : 'inline-flex items-center gap-1 rounded-badge bg-[#F3F4F6] px-2.5 py-0.5 text-xs font-medium text-muted-foreground'
      }
    >
      {children}
    </span>
  )
}
