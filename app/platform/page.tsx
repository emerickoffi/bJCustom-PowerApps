import type { Metadata } from 'next'
import Link from 'next/link'
import { Building2 } from 'lucide-react'
import { requirePlatformAdmin, loadPlatformCompanies, loadPlatformEvents, loadPlatformOverview } from '@/lib/platform'
import { companyStatus, describeEvent, filterCompanies } from '@/lib/platform-shared'
import { formatDate, formatDateTime } from '@/lib/format'
import { PageHeader, pageLayout } from '@/components/shared/page-header'
import { StatusPill } from '@/components/shared/status-badge'
import { SearchInput } from '@/components/shared/search-input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export const metadata: Metadata = { title: 'Companies' }

function Stat({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-panel border border-border bg-card px-4 py-3">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-2xl font-semibold tabular-nums text-foreground">{value.toLocaleString()}</span>
      {note && <span className="text-xs text-muted-foreground">{note}</span>}
    </div>
  )
}

export default async function PlatformCompaniesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requirePlatformAdmin()
  const { q } = await searchParams
  const [overview, companies, events] = await Promise.all([loadPlatformOverview(), loadPlatformCompanies(), loadPlatformEvents(10)])
  const rows = companies ? filterCompanies(companies, q) : null

  return (
    <div className={pageLayout()}>
      <PageHeader icon={Building2} title="Companies" count={companies ? { value: companies.length, noun: 'company', plural: 'companies' } : undefined} />

      {overview && (
        <section aria-label="Totals" className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat
            label="Active companies"
            value={overview.active_companies}
            note={overview.suspended_companies ? `${overview.suspended_companies} suspended` : `${overview.new_companies_30d} new in 30 days`}
          />
          <Stat label="Team members" value={overview.staff_members} />
          <Stat label="Homeowners" value={overview.homeowners} />
          <Stat label="Projects" value={overview.projects} />
        </section>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>All companies</CardTitle>
          <form action="/platform" method="get" className="w-full sm:w-72">
            <SearchInput id="company-search" label="Search companies" placeholder="Name or admin email" defaultValue={q ?? ''} />
          </form>
        </CardHeader>
        <CardContent className="px-0">
          {rows === null ? (
            <p className="px-6 py-8 text-sm text-muted-foreground">Companies could not be loaded. Refresh the page to try again.</p>
          ) : rows.length === 0 ? (
            <p className="px-6 py-8 text-sm text-muted-foreground">{q ? `No company matches "${q}".` : 'No companies yet.'}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Company</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">Plan</TableHead>
                  <TableHead className="text-right">Team</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Homeowners</TableHead>
                  <TableHead className="text-right">Projects</TableHead>
                  <TableHead className="hidden md:table-cell">Last activity</TableHead>
                  <TableHead className="hidden pr-6 lg:table-cell">Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => {
                  const status = companyStatus(c)
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="pl-6">
                        <Link href={`/platform/companies/${c.id}`} className="font-medium text-foreground hover:text-interactive hover:underline">
                          {c.display_name}
                        </Link>
                        <div className="max-w-64 truncate text-xs text-muted-foreground">{c.admin_emails[0] ?? 'No active admin'}</div>
                      </TableCell>
                      <TableCell>
                        <StatusPill tone={status.tone}>{status.label}</StatusPill>
                      </TableCell>
                      <TableCell className="hidden text-sm sm:table-cell">{c.plan_name ?? '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.staff_count}</TableCell>
                      <TableCell className="hidden text-right tabular-nums sm:table-cell">{c.homeowner_count}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.project_count}</TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                        {c.last_activity_at ? formatDate(c.last_activity_at) : 'None yet'}
                      </TableCell>
                      <TableCell className="hidden pr-6 text-sm text-muted-foreground lg:table-cell">{formatDate(c.created_at)}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent owner actions</CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">Feature changes and suspensions you make here will be listed.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {events.map((e, i) => (
                <li key={i} className="flex flex-col gap-0.5 py-2.5 text-sm sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                  <span className="text-foreground">
                    {e.organization_id ? (
                      <Link href={`/platform/companies/${e.organization_id}`} className="font-medium hover:underline">
                        {e.organization_name ?? 'Company'}
                      </Link>
                    ) : (
                      <span className="font-medium">Platform</span>
                    )}
                    {' · '}
                    {describeEvent(e)}
                  </span>
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
