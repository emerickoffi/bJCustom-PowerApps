import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FileDown, GitCompare, Pencil, FileSpreadsheet as FileSpreadsheetIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { requireStaff, canManage } from '@/lib/session'
import { clientDisplayName, getEstimate, getEstimateFamily, getEstimateLineItems } from '@/lib/estimate-queries'
import { DECISION_METHOD_LABELS, formatCentsExact, isEditableStatus } from '@/lib/estimates'
import { formatDate, formatDateTime } from '@/lib/format'
import { PageHeader, DetailList } from '@/components/shared/page-header'
import { EstimateStatusBadge } from '@/components/estimates/estimate-status-badge'
import { EstimateSummary } from '@/components/estimates/estimate-summary'
import { EstimateWorkflow } from '@/components/estimates/estimate-workflow'
import { LineItemsEditor } from '@/components/estimates/line-items-editor'
import { QuickBooksPanel } from '@/components/estimates/quickbooks-panel'
import { getOrgFeatures } from '@/lib/features'
import { getQuickBooksStatus } from '@/lib/quickbooks'
import { cn } from '@/lib/utils'
import { EstimateSignaturePanel } from '@/components/estimates/estimate-signature-panel'
import { estimateSigningEligibility } from '@/lib/estimate-signing'
import { getEstimateSigningState } from '@/lib/esign/queries'
import { getProviderConfig } from '@/lib/esign/dropbox-sign'

export const metadata: Metadata = { title: 'Estimate' }

export default async function EstimateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaff()
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const estimate = await getEstimate(id, session.organizationId)
  if (!estimate) notFound()

  const [items, family, features, signing] = await Promise.all([
    getEstimateLineItems(id),
    getEstimateFamily(estimate.family_id),
    getOrgFeatures(session.organizationId),
    getEstimateSigningState(id),
  ])
  const manager = canManage(session.role)
  const isLatest = family[0]?.id === estimate.id
  const signingEligibility = estimateSigningEligibility({
    status: estimate.status,
    isLatest,
    canManage: manager,
    documentsEnabled: features.documents,
    signaturesEnabled: features.e_signatures,
    providerConfigured: getProviderConfig().configured,
    hasProject: Boolean(estimate.project),
    lineCount: items.length,
  })
  const showSigning = manager && features.e_signatures
  const hasOpenRevision = family.some((f) => isEditableStatus(f.status))
  const editable = manager && isLatest && isEditableStatus(estimate.status)
  const clientName = clientDisplayName(estimate.client)
  const previous = family.find((f) => f.revision < estimate.revision)

  return (
    <div className="flex flex-col gap-8">
      <PageHeader icon={FileSpreadsheetIcon}
        backHref="/estimates"
        backLabel="Estimates"
        eyebrow={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{`${estimate.estimate_number} · Rev ${estimate.revision}`}</span>
            <EstimateStatusBadge status={estimate.status} />
            {estimate.is_demo && (
              <span className="rounded-full bg-champagne-soft px-2 py-0.5 text-xs font-medium text-warning">Demo data</span>
            )}
          </span>
        }
        title={estimate.name}
        description={
          estimate.project ? (
            <span>
              {'For '}
              <Link href={`/projects/${estimate.project.id}`} className="font-medium text-primary hover:underline">
                {estimate.project.name}
              </Link>
              {clientName ? ` · ${clientName}` : ''}
            </span>
          ) : undefined
        }
        actions={
          <>
            {editable && (
              <Button variant="outline" size="lg" render={<Link href={`/estimates/${id}/edit`} />} nativeButton={false}>
                <Pencil data-icon="inline-start" />
                Edit details
              </Button>
            )}
            {previous && (
              <Button
                variant="outline"
                size="lg"
                render={<Link href={`/estimates/${id}/compare?with=${previous.id}`} />}
                nativeButton={false}
              >
                <GitCompare data-icon="inline-start" />
                Compare revisions
              </Button>
            )}
            <Button size="lg" render={<Link href={`/print/estimates/${id}`} target="_blank" />} nativeButton={false}>
              <FileDown data-icon="inline-start" />
              Download PDF
            </Button>
          </>
        }
      />

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex min-w-0 flex-col gap-8">
          <LineItemsEditor estimateId={id} items={items} editable={editable} />

          <section aria-labelledby="details-heading" className="surface flex flex-col gap-5 p-5 md:p-6">
            <h2 id="details-heading" className="font-serif text-xl font-semibold tracking-tight text-foreground">
              Estimate details
            </h2>
            <DetailList
              items={[
                { label: 'Estimate date', value: formatDate(estimate.estimate_date) },
                { label: 'Expires', value: formatDate(estimate.expiration_date) },
                { label: 'Project number', value: estimate.project?.project_number ?? '—' },
                { label: 'Client', value: clientName ?? 'No primary client' },
                { label: 'Submitted', value: formatDateTime(estimate.submitted_at) },
                { label: 'Last updated', value: formatDateTime(estimate.updated_at) },
              ]}
            />
            {estimate.description && (
              <p className="whitespace-pre-line border-t pt-5 text-sm leading-relaxed text-foreground">
                {estimate.description}
              </p>
            )}
            {estimate.notes && (
              <div className="flex flex-col gap-1.5 rounded-xl bg-sage/50 p-4">
                <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Notes</h3>
                <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{estimate.notes}</p>
              </div>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-6">
          <EstimateSummary totals={estimate} />

          {(estimate.status === 'approved' || estimate.status === 'rejected') && (
            <section
              aria-labelledby="decision-heading"
              className={cn(
                'flex flex-col gap-3 rounded-2xl border p-5',
                estimate.status === 'approved' ? 'border-primary/25 bg-primary/5' : 'border-destructive/20 bg-destructive/5',
              )}
            >
              <h2 id="decision-heading" className="font-serif text-lg font-semibold text-foreground">
                {estimate.status === 'approved' ? 'Recorded approval' : 'Recorded rejection'}
              </h2>
              <dl className="grid gap-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Decided by</dt>
                  <dd className="font-medium">{estimate.decision_by_name}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Received via</dt>
                  <dd className="font-medium">
                    {DECISION_METHOD_LABELS[estimate.decision_method as keyof typeof DECISION_METHOD_LABELS] ?? '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Date</dt>
                  <dd className="font-medium">{formatDate(estimate.decision_at)}</dd>
                </div>
              </dl>
              {estimate.decision_note && <p className="text-sm text-muted-foreground">{estimate.decision_note}</p>}
              <p className="text-xs text-muted-foreground">Recorded by staff. Not an electronic signature.</p>
            </section>
          )}

          <EstimateWorkflow
            estimateId={id}
            status={estimate.status}
            isLatest={isLatest}
            hasOpenRevision={hasOpenRevision}
            lineCount={items.length}
            clientName={clientName ?? ''}
            canManage={manager}
          />

          {showSigning && (
            <EstimateSignaturePanel
              estimateId={id}
              projectId={estimate.project?.id ?? null}
              revision={estimate.revision}
              eligibility={signingEligibility}
              signing={signing}
            />
          )}

          {manager && (
            <QuickBooksPanel
              estimateStatus={estimate.status}
              status={getQuickBooksStatus()}
              moduleEnabled={features.quickbooks}
              canConfigure={session.role === 'org_admin'}
            />
          )}

          <section aria-labelledby="revisions-heading" className="surface flex flex-col gap-3 p-5">
            <h2 id="revisions-heading" className="font-serif text-lg font-semibold text-foreground">
              Revision history
            </h2>
            <ol className="flex flex-col divide-y">
              {family.map((rev) => (
                <li key={rev.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="flex min-w-0 flex-col gap-1">
                    <Link
                      href={`/estimates/${rev.id}`}
                      aria-current={rev.id === id ? 'page' : undefined}
                      className={cn('text-sm font-medium hover:text-primary', rev.id === id && 'text-primary')}
                    >
                      {`Revision ${rev.revision}`}
                    </Link>
                    <EstimateStatusBadge status={rev.status} className="w-fit" />
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-sm font-semibold tabular-nums">{formatCentsExact(rev.construction_total_cents)}</span>
                    {rev.id !== id && (
                      <Link href={`/estimates/${id}/compare?with=${rev.id}`} className="text-xs text-primary hover:underline">
                        Compare
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  )
}
