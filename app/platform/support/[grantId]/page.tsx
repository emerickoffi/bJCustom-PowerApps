import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Eye, LifeBuoy } from 'lucide-react'
import { requirePlatformAdmin } from '@/lib/platform'
import { loadSupportView } from '@/lib/support-access'
import { parseSupportSection, SUPPORT_SECTIONS, supportDbMessage, timeLeftLabel } from '@/lib/support-access-shared'
import { humanize, SUPPORT_COLUMNS, type SupportColumn } from '@/lib/support-view-columns'
import { formatCents, formatDate, formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PageHeader, pageLayout } from '@/components/shared/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export const metadata: Metadata = { title: 'Support view' }
// Every load re-checks the grant in the database and writes one access-log entry. Never cache it.
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function display(value: unknown, kind: SupportColumn['kind']): string {
  if (value === null || value === undefined || value === '') return '—'
  switch (kind) {
    case 'date':
      return formatDate(String(value))
    case 'datetime':
      return formatDateTime(String(value))
    case 'cents':
      return formatCents(Number(value))
    case 'percent':
      return `${Math.round(Number(value))}%`
    case 'bool':
      return value ? 'Yes' : 'No'
    case 'number':
      return String(value)
    default: {
      const text = String(value)
      const shown = /^[a-z]+(_[a-z]+)*$/.test(text) ? humanize(text) : text
      return shown.length > 160 ? `${shown.slice(0, 157)}...` : shown
    }
  }
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  )
}

export default async function SupportViewPage({
  params,
  searchParams,
}: {
  params: Promise<{ grantId: string }>
  searchParams: Promise<{ section?: string }>
}) {
  await requirePlatformAdmin()
  const [{ grantId }, { section: rawSection }] = await Promise.all([params, searchParams])
  if (!UUID.test(grantId)) notFound()
  const section = parseSupportSection(rawSection)
  const result = await loadSupportView(grantId, section)

  if ('error' in result) {
    return (
      <div className={pageLayout()}>
        <PageHeader icon={LifeBuoy} title="Support view" backHref="/platform/support" backLabel="Support access" />
        <p role="alert" className="rounded-panel border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-foreground">
          {`${supportDbMessage(result.error)} Ask the company admin to grant access again if you still need it.`}
        </p>
      </div>
    )
  }

  const { grant, project, rows } = result.view
  const counts = section === 'overview' ? ((rows[0] ?? {}) as Record<string, number>) : {}
  const columns = section === 'overview' ? [] : SUPPORT_COLUMNS[section]

  return (
    <div className={pageLayout()}>
      <PageHeader
        icon={LifeBuoy}
        title={project.name}
        backHref="/platform/support"
        backLabel="Support access"
      />

      <div
        role="status"
        className="flex flex-col gap-1 rounded-panel border border-warning/25 bg-champagne-soft px-4 py-3 text-sm text-foreground sm:flex-row sm:items-center sm:justify-between"
      >
        <p className="flex items-center gap-2 font-medium">
          <Eye className="size-4 shrink-0" aria-hidden="true" />
          {`Read-only support view · ${grant.organization_name} · Ticket ${grant.ticket_reference}`}
        </p>
        <p className="text-muted-foreground">
          {`${timeLeftLabel(grant.expires_at)} · Every page you open is logged for the company`}
        </p>
      </div>
      {grant.reason && <p className="text-sm text-muted-foreground">{`Customer's note: ${grant.reason}`}</p>}

      <nav aria-label="Project sections" className="min-w-0">
        <div className="flex min-w-0 gap-1 overflow-x-auto rounded-panel border border-border bg-muted/60 p-1 [scrollbar-width:thin]">
          {SUPPORT_SECTIONS.map((s) => (
            <Link
              key={s.key}
              href={s.key === 'overview' ? `/platform/support/${grant.id}` : `/platform/support/${grant.id}?section=${s.key}`}
              prefetch={false}
              aria-current={s.key === section ? 'page' : undefined}
              className={cn(
                'flex min-h-9 shrink-0 items-center rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-colors',
                s.key === section ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {s.key !== 'overview' && counts[s.key] !== undefined ? `${s.label} (${counts[s.key]})` : s.label}
            </Link>
          ))}
        </div>
      </nav>

      {section === 'overview' ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Project</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Detail label="Number">{display(project.project_number, 'text')}</Detail>
                <Detail label="Status">{display(project.status, 'text')}</Detail>
                <Detail label="Type">{display(project.project_type, 'text')}</Detail>
                <Detail label="Homeowner">{display(project.client, 'text')}</Detail>
                <Detail label="Project manager">{display(project.project_manager, 'text')}</Detail>
                <Detail label="Location">
                  {[project.community, project.city, project.state].filter(Boolean).join(', ') || '—'}
                </Detail>
                <Detail label="Progress">{display(project.progress_percent, 'percent')}</Detail>
                <Detail label="Budget">{display(project.estimated_budget_cents, 'cents')}</Detail>
                <Detail label="Start">{display(project.proposed_start_date, 'date')}</Detail>
                <Detail label="Target completion">{display(project.target_completion_date, 'date')}</Detail>
                <Detail label="Completed">{display(project.completion_date, 'date')}</Detail>
                <Detail label="Last updated">{display(project.updated_at, 'datetime')}</Detail>
              </dl>
              {typeof project.description === 'string' && project.description && (
                <p className="mt-4 border-t pt-4 text-sm leading-relaxed text-foreground">{project.description}</p>
              )}
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground">
            Internal notes, homeowner contact details and file contents are not shown in support view.
          </p>
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{`${SUPPORT_SECTIONS.find((s) => s.key === section)?.label} (${rows.length})`}</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            {rows.length === 0 ? (
              <p className="px-6 text-sm text-muted-foreground">Nothing in this section.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {columns.map((col, i) => (
                        <TableHead key={col.key} className={cn(i === 0 && 'pl-6', i === columns.length - 1 && 'pr-6')}>
                          {col.label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row, r) => (
                      <TableRow key={String(row.id ?? r)}>
                        {columns.map((col, i) => (
                          <TableCell
                            key={col.key}
                            className={cn(
                              'align-top',
                              i === 0 && 'pl-6 font-medium text-foreground',
                              i === columns.length - 1 && 'pr-6',
                              col.kind === 'text' && i > 0 ? 'min-w-32 whitespace-normal' : 'whitespace-nowrap',
                            )}
                          >
                            {display(row[col.key], col.kind)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
