import type { Metadata } from 'next'
import Link from 'next/link'
import { AlertCircle, CheckCircle2, HardHat, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { requireManager } from '@/lib/session'
import { requireFeature } from '@/lib/features'
import { createClient } from '@/lib/supabase/server'
import { sanitizeSearch } from '@/lib/format'
import { PageHeader, EmptyState } from '@/components/shared/page-header'
import { ListFilters } from '@/components/shared/list-filters'
import { SubcontractorTable } from '@/components/subcontractors/subcontractor-table'
import {
  SUBCONTRACTOR_COLUMNS,
  SUBCONTRACTOR_STATUS_LABELS,
  SUBCONTRACTOR_STATUSES,
  isMissingTableError,
  type SubcontractorCompany,
  type SubcontractorStatus,
} from '@/lib/subcontractors'

export const metadata: Metadata = { title: 'Subcontractors' }

const LIMIT = 500

export default async function SubcontractorsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; added?: string }>
}) {
  const session = await requireManager()
  await requireFeature(session.organizationId, 'subcontractors')
  const params = await searchParams
  const q = sanitizeSearch(params.q)
  const status = SUBCONTRACTOR_STATUSES.includes(params.status as SubcontractorStatus)
    ? (params.status as SubcontractorStatus)
    : null
  const added = params.added?.slice(0, 160)
  const filtered = Boolean(q || status)

  const supabase = await createClient()
  let query = supabase
    .from('subcontractor_companies')
    .select(SUBCONTRACTOR_COLUMNS)
    .eq('organization_id', session.organizationId)
    .order('company_name')
    .limit(LIMIT)
  if (status) query = query.eq('status', status)
  if (q) query = query.or(`company_name.ilike.*${q}*,trade.ilike.*${q}*,email.ilike.*${q}*,phone.ilike.*${q}*`)
  const { data, error } = await query
  const rows = (data ?? []) as SubcontractorCompany[]

  const addButton = (
    <Button size="lg" render={<Link href="/subcontractors/new" />} nativeButton={false}>
      <Plus data-icon="inline-start" />
      Add subcontractor
    </Button>
  )

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        icon={HardHat}
        title="Subcontractors"
        description="Trade partners your company works with. Visible only to administrators and project managers."
        actions={!error && addButton}
      />

      {added && !error && (
        <p role="status" className="flex items-start gap-2 rounded-md bg-primary/10 px-3 py-2 text-sm text-primary">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {added} was added to your subcontractors.
        </p>
      )}

      {error ? (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <p className="font-medium text-foreground">
              {isMissingTableError(error) ? 'Subcontractor storage is not set up yet' : 'Subcontractors could not be loaded'}
            </p>
            <p className="text-muted-foreground">
              {isMissingTableError(error)
                ? 'The subcontractor database migration has not been applied for this environment. No records were changed.'
                : 'Refresh the page to try again. If the problem continues, contact support.'}
            </p>
          </div>
        </div>
      ) : (
        <>
          <ListFilters
            searchPlaceholder="Search by company, trade, email, or phone"
            defaultQuery={q}
            defaultStatus={status ?? ''}
            statusOptions={SUBCONTRACTOR_STATUSES.map((s) => ({ value: s, label: SUBCONTRACTOR_STATUS_LABELS[s] }))}
            clearHref={filtered ? '/subcontractors' : undefined}
          />
          {rows.length ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                {rows.length === LIMIT
                  ? `Showing the first ${LIMIT} subcontractors. Narrow your search to find others.`
                  : `${rows.length} ${rows.length === 1 ? 'subcontractor' : 'subcontractors'}`}
              </p>
              <SubcontractorTable rows={rows} />
            </div>
          ) : (
            <EmptyState
              icon={HardHat}
              title={filtered ? 'No matching subcontractors' : 'No subcontractors yet'}
              description={
                filtered
                  ? 'Try a different search or status filter.'
                  : 'Add the trade partners you hire so your team has one place to find their details.'
              }
              action={
                filtered ? (
                  <Button variant="outline" render={<Link href="/subcontractors" />} nativeButton={false}>
                    Clear filters
                  </Button>
                ) : (
                  addButton
                )
              }
            />
          )}
        </>
      )}
    </div>
  )
}
