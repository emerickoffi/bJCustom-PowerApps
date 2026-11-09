import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronDown, GitCompare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { requireStaff, canManage } from '@/lib/session'
import { clientDisplayName, getEstimate, getEstimateFamily, getEstimateLineItems } from '@/lib/estimate-queries'
import { DECISION_METHOD_LABELS, ESTIMATE_STATUSES, centsToInput, formatCentsExact, isEditableStatus } from '@/lib/estimates'
import { EstimateSettingsPanel } from '@/components/estimates/estimate-settings-panel'
import { EstimateDraftProvider } from '@/components/estimates/estimate-draft-context'
import {
  EstimateUnsavedNotice,
  EstimateWorkspaceBody,
  EstimateWorkspaceHeader,
  type NextAction,
} from '@/components/estimates/estimate-workspace'
import { estimatesListHref, isWorkspaceTab, type WorkspaceTab } from '@/lib/estimate-workspace'
import { formatDate, formatDateTime } from '@/lib/format'
import { DetailList } from '@/components/shared/page-header'
import { EstimateStatusBadge } from '@/components/estimates/estimate-status-badge'
import { EstimateMoreMenu, EstimateReadiness } from '@/components/estimates/estimate-workflow'
import { EstimateSheet } from '@/components/estimates/estimate-sheet'
import { EstimateStatusStrip } from '@/components/estimates/estimate-status-strip'
import { QuickBooksPanel } from '@/components/estimates/quickbooks-panel'
import { getOrgFeatures } from '@/lib/features'
import { getQuickBooksStatus } from '@/lib/quickbooks'
import { cn } from '@/lib/utils'
import { EstimateSignaturePanel } from '@/components/estimates/estimate-signature-panel'
import { estimateSigningEligibility } from '@/lib/estimate-signing'
import { getEstimateSigningState } from '@/lib/esign/queries'
import { getProviderConfig } from '@/lib/esign/dropbox-sign'

export const metadata: Metadata = { title: 'Estimate' }

export default async function EstimateDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string; from?: string }>
}) {
  const session = await requireStaff()
  const [{ id }, query] = await Promise.all([params, searchParams])
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
  const signingInput = {
    status: estimate.status,
    isLatest,
    canManage: manager,
    documentsEnabled: features.documents,
    signaturesEnabled: features.e_signatures,
    providerConfigured: getProviderConfig().configured,
    hasProject: Boolean(estimate.project),
    lineCount: items.length,
  }
  const signingEligibility = estimateSigningEligibility(signingInput)
  const revisionEligibility = estimateSigningEligibility({
    ...signingInput,
    canManage: true,
    documentsEnabled: true,
    signaturesEnabled: true,
    providerConfigured: true,
  })
  const revisionNote = revisionEligibility.eligible ? null : revisionEligibility.reason
  const hasOpenRevision = family.some((f) => isEditableStatus(f.status))
  const editable = manager && isLatest && isEditableStatus(estimate.status)
  const clientName = clientDisplayName(estimate.client)
  const previous = family.find((f) => f.revision < estimate.revision)
  const latest = family[0]
  const list = estimatesListHref(query.from, ESTIMATE_STATUSES)
  const initialTab: WorkspaceTab = isWorkspaceTab(query.tab) ? query.tab : 'items'

  const nextAction: NextAction | null = !isLatest
    ? latest
      ? { label: 'Open latest revision', href: `/estimates/${latest.id}` }
      : null
    : isEditableStatus(estimate.status)
      ? items.length > 0 && manager
        ? { label: 'Review & send' }
        : null
      : estimate.status === 'submitted' && manager
        ? { label: signing.summary?.status === 'completed' ? 'Record approval' : 'Record decision' }
        : null

  const decision = (estimate.status === 'approved' || estimate.status === 'rejected') && (
    <section
      aria-labelledby="decision-heading"
      className={cn(
        'flex flex-col gap-2 rounded-lg border p-4',
        estimate.status === 'approved' ? 'border-primary/25 bg-primary/5' : 'border-destructive/20 bg-destructive/5',
      )}
    >
      <h3 id="decision-heading" className="text-sm font-semibold text-foreground">
        {estimate.status === 'approved' ? 'Recorded approval' : 'Recorded rejection'}
      </h3>
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
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
  )

  const collapsible = (label: string, body: React.ReactNode) => (
    <details className="group border-t first:border-t-0">
      <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 px-4 text-sm font-medium text-foreground hover:text-primary [&::-webkit-details-marker]:hidden">
        {label}
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="px-4 pb-4 text-sm leading-relaxed text-foreground">{body}</div>
    </details>
  )

  const details = (
    <section aria-labelledby="details-heading" className="surface flex flex-col overflow-hidden">
      <h2 id="details-heading" className="border-b px-4 py-3 text-sm font-semibold text-foreground">
        Estimate details
      </h2>
      {collapsible(
        'More details',
        <DetailList
          items={[
            { label: 'Project number', value: estimate.project?.project_number ?? '—' },
            { label: 'Submitted', value: formatDateTime(estimate.submitted_at) },
            { label: 'Last updated', value: formatDateTime(estimate.updated_at) },
          ]}
        />,
      )}
      {collapsible(
        'Scope',
        estimate.description ? (
          <p className="whitespace-pre-line">{estimate.description}</p>
        ) : (
          <p className="text-muted-foreground">No scope description. Add one in Pricing &amp; notes.</p>
        ),
      )}
      {collapsible(
        'Notes',
        estimate.notes ? (
          <p className="whitespace-pre-line">{estimate.notes}</p>
        ) : (
          <p className="text-muted-foreground">No notes. Add them in Pricing &amp; notes.</p>
        ),
      )}
    </section>
  )

  const panels: Record<WorkspaceTab, React.ReactNode> = {
    items: (
      <EstimateSheet
        estimateId={id}
        items={items}
        status={estimate.status}
        editable={editable}
        updatedAt={estimate.updated_at}
        serverTotals={estimate}
      />
    ),
    pricing: editable ? (
      <EstimateSettingsPanel
        defaults={{
          markup_percent: String(Number(estimate.markup_percent)),
          contingency_percent: String(Number(estimate.contingency_percent)),
          land_cost: centsToInput(estimate.land_cost_cents),
          description: estimate.description ?? '',
          notes: estimate.notes ?? '',
        }}
      />
    ) : (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          {`Markup ${Number(estimate.markup_percent)}% · Contingency ${Number(estimate.contingency_percent)}% · ${
            estimate.land_cost_cents === null ? 'No land cost' : `Land ${formatCentsExact(estimate.land_cost_cents)} (separate)`
          }. This estimate is locked, so pricing can’t be changed here.`}
        </p>
        {details}
      </div>
    ),
    review: (
      <div className="flex flex-col gap-4">
        <EstimateUnsavedNotice />
        <EstimateStatusStrip
          status={estimate.status}
          submittedAt={estimate.submitted_at}
          decisionAt={estimate.decision_at}
          signature={signing.summary}
        />
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <EstimateReadiness
            estimateId={id}
            status={estimate.status}
            revision={estimate.revision}
            isLatest={isLatest}
            latestHref={latest && latest.id !== id ? `/estimates/${latest.id}` : null}
            hasOpenRevision={hasOpenRevision}
            lineCount={items.length}
            clientName={clientName}
            totalCents={estimate.construction_total_cents}
            estimateDate={estimate.estimate_date}
            expirationDate={estimate.expiration_date}
            editHref={editable ? `/estimates/${id}/edit` : null}
            clientHref={manager && estimate.project ? `/projects/${estimate.project.id}?details=open` : null}
            canManage={manager}
            decision={decision}
            signing={
              <EstimateSignaturePanel
                estimateId={id}
                projectId={estimate.project?.id ?? null}
                revision={estimate.revision}
                eligibility={signingEligibility}
                signing={signing}
                isAdmin={session.role === 'org_admin'}
                revisionNote={revisionNote}
              />
            }
          />
          <div className="flex min-w-0 flex-col gap-4">
            {details}
            {manager && (
              <QuickBooksPanel
                estimateStatus={estimate.status}
                status={getQuickBooksStatus()}
                moduleEnabled={features.quickbooks}
                canConfigure={session.role === 'org_admin'}
              />
            )}
          </div>
        </div>
      </div>
    ),
    history: (
      <section aria-labelledby="revisions-heading" className="surface flex max-w-3xl flex-col gap-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="revisions-heading" className="font-serif text-lg font-semibold text-foreground">
            Revision history
          </h2>
          {previous && (
            <Button variant="outline" size="sm" render={<Link href={`/estimates/${id}/compare?with=${previous.id}`} />} nativeButton={false}>
              <GitCompare data-icon="inline-start" />
              Compare with previous
            </Button>
          )}
        </div>
        <ol className="flex flex-col divide-y">
          {family.map((rev) => (
            <li key={rev.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="flex min-w-0 flex-col gap-1">
                <Link
                  href={`/estimates/${rev.id}${list.from ? `?from=${encodeURIComponent(list.from)}` : ''}`}
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
    ),
  }

  return (
    <EstimateDraftProvider initialTab={initialTab}>
      <div className="flex min-w-0 flex-col">
        <EstimateWorkspaceHeader
          backHref={list.href}
          backLabel="Estimates"
          eyebrow={
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-muted-foreground">{`${estimate.estimate_number} · Rev ${estimate.revision}`}</span>
              <EstimateStatusBadge status={estimate.status} />
              {estimate.is_demo && (
                <span className="rounded-badge bg-champagne-soft px-2 py-0.5 text-xs font-medium text-warning">Demo data</span>
              )}
            </span>
          }
          title={estimate.name}
          subtitle={
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
          editable={editable}
          editHref={editable ? `/estimates/${id}/edit` : undefined}
          pdfHref={`/print/estimates/${id}`}
          nextAction={nextAction}
          moreMenu={manager ? <EstimateMoreMenu estimateId={id} status={estimate.status} /> : undefined}
        />
        <EstimateWorkspaceBody panels={panels} serverTotals={estimate} editable={editable} />
      </div>
    </EstimateDraftProvider>
  )
}
