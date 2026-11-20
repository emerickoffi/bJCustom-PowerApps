import type { Metadata } from 'next'
import { Wallet } from 'lucide-react'
import { requireAdmin } from '@/lib/session'
import { requireFeature } from '@/lib/features'
import { getLaborRates, getTeamMembers } from '@/lib/time-tracking-data'
import { PageHeader, pageLayout } from '@/components/shared/page-header'
import { RateRow } from '@/components/time/rate-row'

export const metadata: Metadata = { title: 'Labor rates' }

const ROLE_LABELS: Record<string, string> = {
  org_admin: 'Administrator',
  project_manager: 'Project manager',
  builder_staff: 'Crew',
}

export default async function LaborRatesPage() {
  const session = await requireAdmin()
  await requireFeature(session.organizationId, 'time_tracking')
  const [team, rates] = await Promise.all([getTeamMembers(session.organizationId), getLaborRates(session.organizationId)])

  return (
    <div className={pageLayout('form')}>
      <PageHeader icon={Wallet} title="Labor rates" backHref="/time" backLabel="Time" />
      <p className="text-sm leading-relaxed text-muted-foreground">
        What one hour of each person costs your company: wage plus payroll taxes, insurance and benefits. It turns approved hours into
        labor cost on each project&apos;s Financials page. Changing a rate applies to time approved afterwards; already-approved time keeps the
        rate it was approved at. Only administrators see these numbers and project managers who approve time.
      </p>
      <section aria-label="Team labor rates" className="surface flex flex-col p-0">
        <ul className="divide-y">
          {team.map((m) => (
            <RateRow key={m.user_id} userId={m.user_id} name={m.name} role={ROLE_LABELS[m.role] ?? m.role} cents={rates.get(m.user_id) ?? null} />
          ))}
        </ul>
      </section>
    </div>
  )
}
