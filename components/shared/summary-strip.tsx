import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { HeaderHelp } from '@/components/shared/page-header'

type IconComponent = React.ComponentType<{ className?: string; 'aria-hidden'?: 'true' }>

const STAT_TONES = {
  neutral: 'bg-muted text-muted-foreground ring-border',
  blue: 'bg-link-soft text-link ring-link-border',
  amber: 'bg-[#FEF3C7] text-[#92400E] ring-[#92400E]/10',
  green: 'bg-[#DCFCE7] text-[#166534] ring-[#166534]/10',
  danger: 'bg-destructive/10 text-destructive ring-destructive/15',
} as const

export type SummaryTone = keyof typeof STAT_TONES

export type SummaryStat = {
  key: string
  icon: IconComponent
  tone: SummaryTone
  label: string
  value: string
  note: string
  href?: string
  /** Appended to the link's accessible name, e.g. "Show overdue invoices". */
  hrefLabel?: string
}

const COLUMNS = {
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
} as const

/** Compact connected KPI strip shared by list workspaces (Invoices, Warranty). */
export function SummaryStrip({
  id,
  scope,
  help,
  helpLabel,
  stats,
}: {
  id: string
  scope: string
  help?: React.ReactNode
  helpLabel?: string
  stats: SummaryStat[]
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1">
        <h2 id={id} className="text-xs text-muted-foreground">
          {scope}
        </h2>
        {help && <HeaderHelp label={helpLabel ?? 'About these figures'}>{help}</HeaderHelp>}
      </div>
      <dl
        className={cn(
          'grid gap-px overflow-hidden rounded-surface border border-border bg-border',
          COLUMNS[stats.length as keyof typeof COLUMNS] ?? 'sm:grid-cols-3',
        )}
      >
        {stats.map(({ key, ...s }) => (
          <Stat key={key} {...s} />
        ))}
      </dl>
    </section>
  )
}

function Stat({ icon: Icon, tone, label, value, note, href, hrefLabel }: Omit<SummaryStat, 'key'>) {
  const danger = tone === 'danger'
  const body = (
    <>
      <span
        className={cn('flex size-7 shrink-0 items-center justify-center rounded-control ring-1 ring-inset', STAT_TONES[tone])}
      >
        <Icon className="size-3.5" aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <dt className="text-xs font-medium text-[#526173]">{label}</dt>
        <dd
          className={cn(
            'truncate text-base font-semibold leading-tight tabular-nums',
            danger ? 'text-destructive' : 'text-[#17212B]',
          )}
        >
          {value}
        </dd>
        <dd className="truncate text-xs text-[#526173]">{note}</dd>
      </div>
    </>
  )
  return (
    <div className="flex bg-card">
      {href ? (
        <Link
          href={href}
          scroll={false}
          aria-label={`${label} ${value}, ${note}${hrefLabel ? `. ${hrefLabel}` : ''}`}
          className="group flex flex-1 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-link-soft/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        >
          {body}
          <ChevronRight className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden="true" />
        </Link>
      ) : (
        <div className="flex flex-1 items-center gap-3 px-4 py-2.5">{body}</div>
      )}
    </div>
  )
}
