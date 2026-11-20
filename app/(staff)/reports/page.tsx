import type { Metadata } from 'next'
import Link from 'next/link'
import { CalendarClock, ChartColumn, ChevronRight, Download, ShieldCheck } from 'lucide-react'
import { requireManager } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import type { FeatureKey } from '@/lib/feature-registry'
import { PageHeader, pageLayout } from '@/components/shared/page-header'

export const metadata: Metadata = { title: 'Reports' }

type ReportCard = { feature: FeatureKey; href: string; title: string; text: string; icon: typeof ChartColumn; adminOnly?: boolean }

const REPORTS: ReportCard[] = [
  { feature: 'project_reports', href: '/reports/job-costing', title: 'Job Costing', text: "Every job's budget, cost to date and projected profit.", icon: ChartColumn },
  { feature: 'schedule_reports', href: '/reports/schedule', title: 'Schedule', text: "What's behind and what's coming up in the next few weeks.", icon: CalendarClock },
  { feature: 'warranty_reports', href: '/reports/warranty', title: 'Warranty', text: 'Claims needing action, coverage ending soon and follow-ups to send.', icon: ShieldCheck },
  { feature: 'data_exports', href: '/reports/exports', title: 'Data Exports', text: 'Download your records as spreadsheets.', icon: Download, adminOnly: true },
]

/** One place for every report the company has turned on. */
export default async function ReportsPage() {
  const session = await requireManager()
  const features = await getOrgFeatures(session.organizationId)
  const isAdmin = session.role === 'org_admin'
  const cards = REPORTS.filter((r) => features[r.feature] && (!r.adminOnly || isAdmin))

  return (
    <div className={pageLayout('form', 'gap-4 md:gap-5')}>
      <PageHeader icon={ChartColumn} title="Reports" />
      {cards.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
          <p className="font-medium text-foreground">No reports turned on</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {isAdmin ? (
              <>
                Turn on the reports you want in{' '}
                <Link href="/settings/features" className="underline">
                  Feature management
                </Link>
                .
              </>
            ) : (
              'Ask an administrator to turn on the reports you need.'
            )}
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {cards.map((r) => (
            <li key={r.href}>
              <Link
                href={r.href}
                className="group flex h-full items-start gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/30"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <r.icon className="size-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-foreground">{r.title}</span>
                  <span className="block text-sm text-muted-foreground">{r.text}</span>
                </span>
                <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {isAdmin && cards.length > 0 && cards.length < REPORTS.length && (
        <p className="text-xs text-muted-foreground">
          More reports can be turned on in{' '}
          <Link href="/settings/features" className="underline">
            Feature management
          </Link>
          .
        </p>
      )}
    </div>
  )
}
