import type { Metadata } from 'next'
import Link from 'next/link'
import { Download, ShieldCheck } from 'lucide-react'
import { requireAdmin } from '@/lib/session'
import { requireFeature } from '@/lib/features'
import { DATASETS } from '@/lib/data-exports'
import { Button } from '@/components/ui/button'
import { PageHeader, pageLayout } from '@/components/shared/page-header'

export const metadata: Metadata = { title: 'Data exports' }

/** One-click spreadsheet downloads of company records. Administrators only. */
export default async function DataExportsPage() {
  const session = await requireAdmin()
  const features = await requireFeature(session.organizationId, 'data_exports')
  const datasets = DATASETS.filter((d) => !d.feature || features[d.feature])

  return (
    <div className={pageLayout('form', 'gap-4 md:gap-5')}>
      <PageHeader icon={Download} title="Data Exports" />
      <p className="text-sm text-muted-foreground">
        Download your records as spreadsheets that open in Excel, Google Sheets or Numbers. Each file has everything in Trefort
        today, including archived records.
      </p>

      <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
        {datasets.map((d) => (
          <li key={d.key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
            <div className="min-w-0">
              <p className="font-medium text-foreground">{d.label}</p>
              <p className="text-sm text-muted-foreground">{d.description}</p>
            </div>
            <Button variant="outline" render={<a href={`/api/exports/${d.key}`} download />} nativeButton={false}>
              <Download data-icon="inline-start" />
              Download
            </Button>
          </li>
        ))}
      </ul>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          Only administrators can download exports. Files include client contact details and, for time entries, labor costs, so
          store them carefully.
          {features.project_reports && (
            <>
              {' '}
              For budget and profit by job, use the{' '}
              <Link href="/reports/job-costing" className="underline">
                Job Costing report
              </Link>
              .
            </>
          )}
        </span>
      </p>
    </div>
  )
}
