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
}: {
  metrics: FinancialMetrics
  scheduleRisk: ScheduleRiskSummary
  /** Cards allowed by the organization's dashboard settings. Omitted means all cards. */
  visible?: ReadonlySet<KpiCardId>
}) {
  const { estimates, contracts, receivables } = metrics

  const approval =
    estimates.state === 'available'
      ? (() => {
          const { amountCents, count, items } = estimates.value.awaitingApproval
          return {
            value: `${count} pending`,
            hint: count
              ? `Proposed value: ${formatCents(amountCents)}${count === 1 ? ` · ${items[0].estimateNumber}` : ''}`
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
            `Jobs with approved contract value: ${contracts.value.establishedCount}`,
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
              : `No verified risks · ${scheduleRisk.value.evaluated} of ${scheduleRisk.value.total} jobs eligible for schedule assessment checked${
                  scheduleRisk.value.evaluated < scheduleRisk.value.total
                    ? `; ${scheduleRisk.value.total - scheduleRisk.value.evaluated} not assessed (no dated schedule)`
                    : ''
                }`,
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

  const show = (id: KpiCardId) => !visible || visible.has(id)
  return (
    <>
      {show('card_approval') && <StatCard label="Awaiting Your Approval" icon={FileSignature} tone="approval" {...approval} />}
      {show('card_contract') && (
        <StatCard label="Contract Value" icon={Landmark} href="/estimates?status=approved" tone="contract" {...contract} />
      )}
      {show('card_schedule') && <StatCard label="Schedule Risk" icon={CalendarClock} tone="schedule" {...schedule} />}
      {show('card_receivables') && <StatCard label="Receivables" icon={Receipt} tone="receivables" {...ar} />}
    </>
  )
}
