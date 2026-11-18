import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Building2 } from 'lucide-react'
import { requirePlatformAdmin, loadPlatformCompany, loadPlatformCompanyBilling, loadPlatformPlans } from '@/lib/platform'
import { companyFeatureRows, companyStatus, describeEvent, planName } from '@/lib/platform-shared'
import { formatDate, formatDateTime } from '@/lib/format'
import { ROLE_LABELS } from '@/lib/domain'
import { PageHeader, pageLayout } from '@/components/shared/page-header'
import { StatusPill } from '@/components/shared/status-badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { CompanyFeatureSwitches } from '@/components/platform/company-feature-switches'
import { CompanySuspension } from '@/components/platform/company-suspension'
import { CompanyPlanPicker } from '@/components/platform/company-plan-picker'

export const metadata: Metadata = { title: 'Company' }

function team_count(members: { role: string; status: string }[]) {
  return members.filter((m) => m.role !== 'client' && m.status === 'active').length
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  )
}

export default async function PlatformCompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePlatformAdmin()
  const { id } = await params
  if (!UUID.test(id)) notFound()
  const [company, plans, billing] = await Promise.all([loadPlatformCompany(id), loadPlatformPlans(), loadPlatformCompanyBilling(id)])
  if (!company) notFound()
  const plan = plans.find((p) => p.key === company.plan_key) ?? null

  const status = companyStatus(company)
  const isOwnCompany = company.members.some((m) => m.user_id === session.userId && m.status === 'active')
  const features = companyFeatureRows(company.feature_overrides, plan).map((r) => ({
    key: r.feature.key,
    label: r.feature.label,
    description: r.feature.description,
    group: r.feature.group,
    switchedOn: r.switchedOn,
    effective: r.effective,
    blockedBy: r.blockedBy,
    notInPlan: r.notInPlan,
  }))
  const seats = company.counts.staff_seats ?? team_count(company.members)
  const team = company.members.filter((m) => m.role !== 'client')
  const homeowners = company.members.filter((m) => m.role === 'client')

  return (
    <div className={pageLayout()}>
      <PageHeader
        icon={Building2}
        title={company.display_name}
        backHref="/platform"
        backLabel="Companies"
        titleAddon={<StatusPill tone={status.tone}>{status.label}</StatusPill>}
      />

      {company.suspended_at && (
        <div role="status" className="rounded-panel border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-foreground">
          <p className="font-medium">{`Suspended on ${formatDateTime(company.suspended_at)}${company.suspended_by_email ? ` by ${company.suspended_by_email}` : ''}.`}</p>
          {company.suspended_reason && <p className="mt-0.5 text-muted-foreground">{`Reason: ${company.suspended_reason}`}</p>}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Company</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Detail label="Legal name">{company.legal_name || '—'}</Detail>
              <Detail label="Location">{[company.city, company.state].filter(Boolean).join(', ') || '—'}</Detail>
              <Detail label="Joined">{formatDate(company.created_at)}</Detail>
              <Detail label="Email">{company.email || '—'}</Detail>
              <Detail label="Phone">{company.phone || '—'}</Detail>
              <Detail label="Project prefix">{company.project_number_prefix || '—'}</Detail>
              <Detail label="Projects">{company.counts.projects}</Detail>
              <Detail label="Clients">{company.counts.clients}</Detail>
              <Detail label="Estimates · Invoices">{`${company.counts.estimates} · ${company.counts.invoices}`}</Detail>
              <Detail label="Last activity">{company.last_activity_at ? formatDateTime(company.last_activity_at) : 'None yet'}</Detail>
              <Detail label="Plan">{planName(plans, company.plan_key)}</Detail>
              <Detail label="Team seats">
                {company.plan_max_staff ? `${seats} of ${company.plan_max_staff}` : `${seats} (unlimited)`}
                {company.counts.pending_staff_invites ? ` · ${company.counts.pending_staff_invites} invited` : ''}
              </Detail>
              <Detail label="Billing">
                {companyStatus({ suspended_at: null, subscription_status: company.subscription_status }).label}
                {billing?.billing_interval ? ` · ${billing.billing_interval === 'year' ? 'yearly' : 'monthly'}` : ''}
              </Detail>
              {billing?.trial_ends_at && company.subscription_status === 'trialing' && (
                <Detail label="Trial ends">{formatDate(billing.trial_ends_at)}</Detail>
              )}
              {billing?.current_period_end && (
                <Detail label={billing.cancel_at_period_end ? 'Ends on' : 'Renews on'}>{formatDate(billing.current_period_end)}</Detail>
              )}
              <Detail label="Time zone">{company.timezone || '—'}</Detail>
            </dl>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-5">
        {plans.length > 0 && company.plan_key && (
          <Card>
            <CardHeader>
              <CardTitle>Plan</CardTitle>
              <CardDescription>The plan sets which modules and how many team seats this company can use.</CardDescription>
            </CardHeader>
            <CardContent>
              <CompanyPlanPicker key={company.plan_key} organizationId={company.id} currentPlan={company.plan_key} plans={plans} />
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Access</CardTitle>
            <CardDescription>
              {company.suspended_at
                ? 'Nobody in this company can open it until you reactivate it.'
                : 'Suspending pauses access for the whole company and keeps all its data.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CompanySuspension
              organizationId={company.id}
              companyName={company.display_name}
              suspended={Boolean(company.suspended_at)}
              isOwnCompany={isOwnCompany}
            />
          </CardContent>
        </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{`Team (${team.length})`}</CardTitle>
          {homeowners.length > 0 && <CardDescription>{`Plus ${homeowners.length} homeowner portal ${homeowners.length === 1 ? 'account' : 'accounts'}.`}</CardDescription>}
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Person</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden pr-6 md:table-cell">Last sign-in</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {company.members.map((m) => (
                <TableRow key={m.user_id}>
                  <TableCell className="pl-6">
                    <div className="font-medium text-foreground">{m.full_name || m.email}</div>
                    {m.full_name && <div className="text-xs text-muted-foreground">{m.email}</div>}
                  </TableCell>
                  <TableCell className="text-sm">{ROLE_LABELS[m.role] ?? m.role}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {m.status !== 'active' ? m.status : m.activation_required ? 'Invited, not activated' : 'Active'}
                  </TableCell>
                  <TableCell className="hidden pr-6 text-sm text-muted-foreground md:table-cell">
                    {m.last_sign_in_at ? formatDateTime(m.last_sign_in_at) : 'Never'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Modules</CardTitle>
          <CardDescription>
            Switch modules on or off for this company. The company’s own administrators see the same switches in their settings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CompanyFeatureSwitches organizationId={company.id} rows={features} planName={plan?.name} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Owner actions on this company</CardTitle>
        </CardHeader>
        <CardContent>
          {company.events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No owner actions yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {company.events.map((e, i) => (
                <li key={i} className="flex flex-col gap-0.5 py-2.5 text-sm sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                  <span className="text-foreground">{describeEvent(e)}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDateTime(e.created_at)}
                    {e.actor_email ? ` · ${e.actor_email}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
