import { CircleCheck, FolderKanban, HardHat } from 'lucide-react'
import type { DirectorySummary as Summary } from '@/lib/subcontractor-directory'

export function DirectorySummary({ summary }: { summary: Summary }) {
  const metrics = [
    { label: 'Total subcontractors', value: summary.total, icon: HardHat, hint: 'In your directory' },
    { label: 'Active', value: summary.active, icon: CircleCheck, hint: 'Available for new work' },
    {
      label: 'On projects',
      value: summary.onProjects,
      icon: FolderKanban,
      hint: summary.onProjects === null ? 'Project associations not set up' : 'Associated with at least one project',
    },
  ]
  return (
    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {metrics.map(({ label, value, icon: Icon, hint }) => (
        <div key={label} className="flex items-center gap-3 rounded-xl border border-border/70 bg-card px-4 py-3 shadow-xs">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#EAF0E9] text-primary" aria-hidden="true">
            <Icon className="size-4" />
          </span>
          <div className="flex min-w-0 flex-col">
            <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
            <dd className="flex items-baseline gap-2">
              <span className="font-serif text-2xl font-semibold leading-tight tabular-nums text-foreground">
                {value ?? '—'}
              </span>
              <span className="truncate text-xs text-muted-foreground">{hint}</span>
            </dd>
          </div>
        </div>
      ))}
    </dl>
  )
}
