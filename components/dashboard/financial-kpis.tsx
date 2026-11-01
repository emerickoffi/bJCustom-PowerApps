import { Fragment, type ReactNode } from 'react'
import { CalendarClock, FileSignature, Landmark, Receipt } from 'lucide-react'
import { StatCard } from '@/components/dashboard/stat-card'
import { formatCents } from '@/lib/format'
import type { FinancialMetrics } from '@/lib/financial-metrics-data'
import type { ScheduleRiskSummary } from '@/lib/dashboard-workspace-data'

const UNAVAILABLE = '—'
const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`

/** Manager-only KPI row. Values come from verified server summaries; unknown data renders a dash, never a fabricated $0. */
export type KpiCardId = 'card_approval' | 'card_contract' | 'card_schedule' | 'card_receivables'

export function FinancialKpis({
  metrics,
  scheduleRisk,
  visible,
  order,
}: {
  metrics: FinancialMetrics
  scheduleRisk: ScheduleRiskSummary
  /** Cards allowed by the organization's dashboard settings. Omitted means all cards. */
  visible?: ReadonlySet<KpiCardId>
  /** Left-to-right order from the organization's layout. Omitted means the built-in order. */
  order?: readonly KpiCardId[]
}) {
  const { estimates, contracts, receivables } = metrics

  const approval =
    estimates.state === 'available'
      ? (() => {
          const { amountCents, count, items } = estimates.value.awaitingApproval
          return {
            value: `${count} pending`,
            subValue: `Proposed value: ${formatCents(amountCents)}`,
            hint: count
              ? count === 1
                ? `${items[0].estimateNumber} signed and awaiting your decision`
                : `${plural(count, 'signed estimate')} awaiting your decision`
              : 'No signed estimates awaiting a decision',
            href: count === 1 ? `/estimates/${items[0].id}` : '/actions?category=approvals',
            accent: count ? ('champagne' as const) : undefined,
          }
        })()
      : { value: UNAVAILABLE, hint: estimates.reason, href: '/actions?category=approvals', accent: 'neutral' as const }

  const contract =
    contracts.state === 'available'
      ? {
          value: formatCents(contracts.value.contractCents),
          countTo: { value: contracts.value.contractCents, format: 'cents' as const },
          hint: [
            `Approved estimates plus approved change orders on ${plural(contracts.value.establishedCount, 'active project')}`,
            contracts.value.needsReviewCount ? `${contracts.value.needsReviewCount} need review` : null,
          ]
            .filter(Boolean)
            .join(' · '),
          accent: undefined,
        }
      : { value: UNAVAILABLE, hint: contracts.reason, accent: 'neutral' as const }

  const schedule =
    scheduleRisk.state === 'available'
      ? {
          value: scheduleRisk.value.atRisk,
          countTo: { value: scheduleRisk.value.atRisk, format: 'count' as const },
          hint: scheduleRisk.value.headline
            ? scheduleRisk.value.atRisk > 1
              ? `${scheduleRisk.value.headline} (+${scheduleRisk.value.atRisk - 1} more)`
              : scheduleRisk.value.headline
            : scheduleRisk.value.evaluated === 0
              ? scheduleRisk.value.total
                ? `Not assessed: ${plural(scheduleRisk.value.total, 'active job')} without dated schedules`
                : 'No active jobs to assess'
              : `No verified risks · ${scheduleRisk.value.evaluated} of ${plural(scheduleRisk.value.total, 'active job')} assessed`,
          href: scheduleRisk.value.projectId ? `/projects/${scheduleRisk.value.projectId}/schedule` : '/actions?category=schedule',
          accent: scheduleRisk.value.critical ? ('danger' as const) : scheduleRisk.value.atRisk ? ('warning' as const) : undefined,
        }
      : { value: UNAVAILABLE, hint: scheduleRisk.reason, href: '/schedule', accent: 'neutral' as const }

  const ar =
    receivables.state === 'available'
      ? {
          value: formatCents(receivables.value.outstandingCents),
          countTo: { value: receivables.value.outstandingCents, format: 'cents' as const },
          hint: receivables.value.outstandingCount
            ? `${plural(receivables.value.outstandingCount, 'open invoice')}${
                receivables.value.overdueCount ? ` · ${formatCents(receivables.value.overdueCents)} overdue` : ' · none overdue'
              }`
            : 'No issued invoices outstanding',
          href: receivables.value.overdueCount ? '/invoices?status=overdue' : '/invoices',
          accent: receivables.value.overdueCount ? ('warning' as const) : undefined,
        }
      : { value: UNAVAILABLE, hint: receivables.reason, href: '/invoices', accent: 'neutral' as const }

  const cards: Record<KpiCardId, ReactNode> = {
    card_approval: <StatCard label="Awaiting Your Approval" icon={FileSignature} tone="approval" {...approval} />,
    card_contract: <StatCard label="Contract Value" icon={Landmark} href="/estimates?status=approved" tone="contract" {...contract} />,
    card_schedule: <StatCard label="Schedule Risk" icon={CalendarClock} tone="schedule" {...schedule} />,
    card_receivables: <StatCard label="Receivables" icon={Receipt} tone="receivables" {...ar} />,
  }
  const sequence = order ?? (Object.keys(cards) as KpiCardId[])
  return (
    <>
      {sequence
        .filter((id) => !visible || visible.has(id))
        .map((id) => (
          <Fragment key={id}>{cards[id]}</Fragment>
        ))}
    </>
  )
}
