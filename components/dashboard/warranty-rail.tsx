import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'
import { DashboardSectionHeader } from '@/components/dashboard/dashboard-section-header'
import { WARRANTY_STAGE_LABELS, type WarrantyStage } from '@/components/warranty/stage'
import type { WarrantyOverview } from '@/lib/dashboard-workspace-data'
import { formatDate } from '@/lib/format'

const VISIBLE = 4

export function WarrantyRail({ overview }: { overview: WarrantyOverview }) {
  if (overview.state === 'disabled') return null
  const rows = overview.state === 'available' ? overview.value.rows : []
  const sorted = [...rows].sort(
    (a, b) =>
      b.openClaims - a.openClaims ||
      (a.milestoneDueOn ?? '9999').localeCompare(b.milestoneDueOn ?? '9999') ||
      a.projectName.localeCompare(b.projectName),
  )

  return (
    <section aria-labelledby="warranty-heading" className="surface flex flex-col gap-3 p-4">
      <DashboardSectionHeader
        id="warranty-heading"
        title="Warranty"
        description={
          overview.state === 'available'
            ? `${overview.value.total} ${overview.value.total === 1 ? 'home' : 'homes'} monitored`
            : undefined
        }
        icon={ShieldCheck}
      />
      {overview.state === 'unavailable' ? (
        <p className="rounded-lg bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">{overview.reason}</p>
      ) : sorted.length ? (
        <ul className="flex flex-col divide-y divide-border/60">
          {sorted.slice(0, VISIBLE).map((w) => (
            <li key={w.projectId}>
              <Link
                href={`/projects/${w.projectId}/warranty`}
                className="group flex items-start justify-between gap-3 rounded-lg py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-sm font-semibold text-foreground group-hover:text-primary">
                    {w.projectName}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {WARRANTY_STAGE_LABELS[w.stage as WarrantyStage] ?? w.stage}
                  </span>
                  {w.milestoneLabel && (
                    <span className="truncate text-xs text-muted-foreground/80">
                      {`Next: ${w.milestoneLabel}${w.milestoneDueOn ? ` · ${formatDate(w.milestoneDueOn)}` : ''}`}
                    </span>
                  )}
                </div>
                {w.openClaims > 0 && (
                  <span className="shrink-0 rounded-full bg-champagne-soft px-2 py-0.5 text-[0.7rem] font-semibold text-warning">
                    {`${w.openClaims} open ${w.openClaims === 1 ? 'claim' : 'claims'}`}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">No homes in warranty monitoring.</p>
      )}
      {sorted.length > VISIBLE && (
        <p className="text-xs text-muted-foreground">{`${sorted.length - VISIBLE} more monitored`}</p>
      )}
    </section>
  )
}
