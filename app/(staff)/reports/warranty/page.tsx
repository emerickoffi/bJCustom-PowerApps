import type { Metadata } from 'next'
import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'
import { requireManager } from '@/lib/session'
import { requireFeature } from '@/lib/features'
import { loadWarrantyReport } from '@/lib/warranty-report-data'
import { COVERAGE_WINDOW_DAYS, FOLLOWUP_WINDOW_DAYS, type ClaimItem } from '@/lib/warranty-report'
import { SERVICE_RESPONSE_DAYS } from '@/lib/warranty-coverage'
import { CLAIM_STATUS_LABELS } from '@/components/warranty/claim-list'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PageHeader, pageLayout } from '@/components/shared/page-header'
import { DeferredPrintButton } from '@/components/print/deferred-print-button'
import { WarrantyExportMenu } from '@/components/warranty/export-menu'

export const metadata: Metadata = { title: 'Warranty report' }

const STAFF_LABELS: Record<string, string> = { ...CLAIM_STATUS_LABELS, ready_for_validation: 'Awaiting homeowner review' }
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function Card({ label, value, hint, tone }: { label: string; value: number; hint: string; tone?: 'bad' | 'warn' }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={cn('text-xl font-semibold tabular-nums text-foreground', tone === 'bad' && value > 0 && 'text-destructive', tone === 'warn' && value > 0 && 'text-[#96570E]')}>{value}</dd>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}

function Section({ title, count, empty, children }: { title: string; count: number; empty: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 print:break-inside-avoid">
      <h2 className="text-base font-semibold text-foreground">
        {title} <span className="font-normal text-muted-foreground">({count})</span>
      </h2>
      {count === 0 ? (
        <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">{children}</ul>
      )}
    </section>
  )
}

function ClaimRow({ c }: { c: ClaimItem }) {
  return (
    <li className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <p className="font-medium text-foreground">{c.title}</p>
        <p className="text-sm text-muted-foreground">
          <Link href={`/projects/${c.project_id}/warranty`} className="hover:text-foreground hover:underline">
            {c.project_name}
          </Link>{' '}
          · {c.category} · {c.location} · {c.assignee ?? 'Unassigned'}
        </p>
      </div>
      <div className="shrink-0 text-sm sm:text-right">
        <p className={cn(c.pastTarget ? 'font-medium text-destructive' : 'text-foreground')}>
          {c.pastTarget ? `No update in ${c.daysSinceUpdate} days` : STAFF_LABELS[c.status] ?? c.status}
        </p>
        <p className="text-muted-foreground">
          {c.pastTarget ? STAFF_LABELS[c.status] ?? c.status : `Open ${plural(c.daysOpen, 'day')}`}
        </p>
      </div>
    </li>
  )
}

/** Claims needing action, coverage ending soon and follow-ups to send, across every home under warranty. */
export default async function WarrantyReportPage() {
  const session = await requireManager()
  await requireFeature(session.organizationId, 'warranty_reports')
  const r = await loadWarrantyReport(session.organizationId)
  const pastTarget = r.needsAction.filter((c) => c.pastTarget).length

  return (
    <div className={pageLayout('workspace', 'gap-4 md:gap-5')}>
      <PageHeader
        icon={ShieldCheck}
        title="Warranty Report"
        actions={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <WarrantyExportMenu />
            <DeferredPrintButton />
          </div>
        }
      />
      <p className="text-sm text-muted-foreground">As of {formatDate(r.today)} · every home under warranty</p>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card label="Homes under warranty" value={r.homes} hint="Not archived." />
        <Card label="Claims needing your action" value={r.needsAction.length} hint="Submitted, in review, accepted or being repaired." tone="warn" />
        <Card label={`Past the ${SERVICE_RESPONSE_DAYS}-day response target`} value={pastTarget} hint="No update to the homeowner in over two weeks." tone="bad" />
        <Card label="Coverage ending" value={r.coverageEnding.length} hint={`In the next ${COVERAGE_WINDOW_DAYS} days.`} tone="warn" />
      </dl>

      <Section title="Claims needing your action" count={r.needsAction.length} empty="No claims are waiting on you.">
        {r.needsAction.map((c) => (
          <ClaimRow key={c.id} c={c} />
        ))}
      </Section>

      <Section title="Coverage ending soon" count={r.coverageEnding.length} empty={`No coverage ends in the next ${COVERAGE_WINDOW_DAYS} days.`}>
        {r.coverageEnding.map((m) => (
          <li key={`${m.project_id}-${m.coverage_name}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <div className="min-w-0">
              <p className="font-medium text-foreground">{m.coverage_name}</p>
              <Link href={`/projects/${m.project_id}/warranty`} className="text-sm text-muted-foreground hover:text-foreground hover:underline">
                {m.project_name}
              </Link>
            </div>
            <p className="text-sm sm:text-right">
              <span className="text-foreground">Ends {formatDate(m.due_on)}</span>
              <span className="block text-muted-foreground">{m.daysLeft === 0 ? 'Today' : `${plural(m.daysLeft, 'day')} left`}</span>
            </p>
          </li>
        ))}
      </Section>

      <Section title="Anniversary follow-ups to send" count={r.followups.length} empty={`No follow-ups due in the next ${FOLLOWUP_WINDOW_DAYS} days.`}>
        {r.followups.map((f) => (
          <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <div className="min-w-0">
              <p className="font-medium text-foreground">{f.coverage_name}</p>
              <Link href={`/projects/${f.project_id}/warranty`} className="text-sm text-muted-foreground hover:text-foreground hover:underline">
                {f.project_name}
              </Link>
            </div>
            <p className={cn('text-sm sm:text-right', f.daysUntil < 0 ? 'font-medium text-destructive' : 'text-muted-foreground')}>
              {f.daysUntil < 0 ? `${plural(-f.daysUntil, 'day')} overdue` : f.daysUntil === 0 ? 'Due today' : `Due in ${plural(f.daysUntil, 'day')}`}
              <span className="block font-normal text-muted-foreground">{f.status === 'prepared' ? 'Prepared, not sent' : 'Not started'}</span>
            </p>
          </li>
        ))}
      </Section>

      <Section title="Waiting on the homeowner" count={r.waitingOnHomeowner.length} empty="No claims are waiting on homeowners.">
        {r.waitingOnHomeowner.map((c) => (
          <ClaimRow key={c.id} c={c} />
        ))}
      </Section>
    </div>
  )
}
