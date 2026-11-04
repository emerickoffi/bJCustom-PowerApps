import { Fragment, type ComponentProps, type ReactNode } from 'react'
import { ClipboardCheck, Coins, FileText, TriangleAlert } from 'lucide-react'
import { KpiCard } from '@/components/dashboard/stat-card'
import { formatCents } from '@/lib/format'
import type { FinancialMetrics } from '@/lib/financial-metrics-data'
import type { ScheduleRiskSummary } from '@/lib/dashboard-workspace-data'

const UNAVAILABLE = '—'
const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`

type CardContent = Pick<ComponentProps<typeof KpiCard>, 'value' | 'countTo' | 'note' | 'details' | 'emphasis'> & {
  href?: string
}

/** Unknown data renders a dash plus its reason, never a fabricated $0. */
const unavailable = (reason: string): CardContent => ({ value: UNAVAILABLE, note: reason, emphasis: 'muted' })

/** Manager-only KPI row. Values come from verified server summaries. */
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

  const approval: CardContent =
    estimates.state === 'available'
      ? (() => {
          const { amountCents, count, items } = estimates.value.awaitingApproval
          return {
            value: `${count} pending`,
            details: [
              count
                ? count === 1
                  ? `${items[0].estimateNumber} signed and awaiting your decision`
                  : `${plural(count, 'signed estimate')} awaiting your decision`
                : 'No signed estimates awaiting a decision',
              `Proposed value: ${formatCents(amountCents)}`,
            ],
            href: count === 1 ? `/estimates/${items[0].id}` : '/actions?category=approvals',
            emphasis: count ? 'pending' : undefined,
          }
        })()
      : unavailable(estimates.reason)

  const contract: CardContent =
    contracts.state === 'available'
      ? {
          value: formatCents(contracts.value.contractCents),
          countTo: { value: contracts.value.contractCents, format: 'cents' },
          note: contracts.value.needsReviewCount ? `${contracts.value.needsReviewCount} need review` : undefined,
          details: [
            contracts.value.establishedCount
              ? `From ${plural(contracts.value.establishedCount, 'active job')} with an approved estimate, including approved change orders.`
              : 'No active jobs with an approved estimate yet.',
          ],
        }
      : unavailable(contracts.reason)

  const schedule: CardContent =
    scheduleRisk.state === 'available'
      ? (() => {
          const { atRisk, critical, headline, evaluated, total, projectId } = scheduleRisk.value
          const partial = evaluated > 0 && evaluated < total
          return {
            value: atRisk,
            countTo: { value: atRisk, format: 'count' },
            note:
              evaluated === 0
                ? total
                  ? `Not assessed: no dated schedules`
                  : 'No active jobs to assess'
                : partial
                  ? `${evaluated} of ${total} jobs assessed`
                  : undefined,
            details: [
              headline
                ? atRisk > 1
                  ? `${headline} (+${atRisk - 1} more)`
                  : headline
                : evaluated === 0
                  ? total
                    ? `Not assessed: ${plural(total, 'active job')} without dated schedules.`
                    : 'No active jobs to assess.'
                  : 'No verified risks.',
              `${evaluated} of ${plural(total, 'active job')} assessed. Only jobs with dated schedules are evaluated.`,
            ],
            href: projectId ? `/projects/${projectId}/schedule` : '/actions?category=schedule',
            emphasis: critical ? 'danger' : atRisk ? 'attention' : undefined,
          }
        })()
      : { ...unavailable(scheduleRisk.reason), href: '/schedule' }

  const ar: CardContent =
    receivables.state === 'available'
      ? {
          value: formatCents(receivables.value.outstandingCents),
          countTo: { value: receivables.value.outstandingCents, format: 'cents' },
          note: receivables.value.overdueCount ? `${formatCents(receivables.value.overdueCents)} overdue` : undefined,
          details: [
            receivables.value.outstandingCount
              ? `${plural(receivables.value.outstandingCount, 'open invoice')}${
                  receivables.value.overdueCount
                    ? `, ${plural(receivables.value.overdueCount, 'overdue invoice')} totaling ${formatCents(receivables.value.overdueCents)}`
                    : ', none overdue'
                }.`
              : 'No issued invoices outstanding.',
          ],
          href: receivables.value.overdueCount ? '/invoices?status=overdue' : '/invoices',
        }
      : { ...unavailable(receivables.reason), href: '/invoices' }

  const cards: Record<KpiCardId, ReactNode> = {
    card_approval: (
      <KpiCard label="Awaiting Your Approval" icon={ClipboardCheck} tone="approval" {...approval} href={approval.href ?? '/actions?category=approvals'} />
    ),
    card_contract: <KpiCard label="Contract Value" icon={FileText} tone="contract" {...contract} href="/estimates?status=approved" />,
    card_schedule: <KpiCard label="Schedule Risk" icon={TriangleAlert} tone="schedule" {...schedule} href={schedule.href ?? '/schedule'} />,
    card_receivables: <KpiCard label="Receivables" icon={Coins} tone="receivables" {...ar} href={ar.href ?? '/invoices'} />,
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
