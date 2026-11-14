'use client'

import Link from 'next/link'
import { ArrowRight, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  PreviewDetail,
  PreviewDetails,
  PreviewSection,
  RecordPreviewBody,
  RecordPreviewHeader,
  RecordPreviewLayout,
} from '@/components/shared/record-preview'
import { EstimateStatusBadge } from '@/components/estimates/estimate-status-badge'
import { formatCents, formatDate } from '@/lib/format'
import type { EstimateStatus } from '@/lib/estimates'
import {
  ESTIMATE_PREVIEW_PANEL_ID,
  ESTIMATE_PREVIEW_PARAM,
  estimatePreviewApiPath,
  estimatePreviewErrorState,
  type EstimatePreview as PreviewData,
} from '@/lib/estimate-preview'

export type EstimatePreviewRecord = {
  id: string
  name: string
  estimateNumber: string
  status: EstimateStatus
  /** The list's filters, carried into the full estimate so its Back link returns here. */
  href: string
}

/** The Estimates list with its on-demand preview, sharing the Projects, Clients, Contacts, and Subcontractors pattern. */
export function EstimatePreviewLayout({
  estimates,
  children,
}: {
  estimates: EstimatePreviewRecord[]
  children: React.ReactNode
}) {
  return (
    <RecordPreviewLayout
      records={estimates}
      param={ESTIMATE_PREVIEW_PARAM}
      panelId={ESTIMATE_PREVIEW_PANEL_ID}
      label="Estimate preview"
      renderPreview={(estimate) => <EstimatePreview key={estimate.id} estimate={estimate} />}
    >
      {children}
    </RecordPreviewLayout>
  )
}

function EstimatePreview({ estimate }: { estimate: EstimatePreviewRecord }) {
  return (
    <>
      <RecordPreviewHeader
        title={estimate.name}
        closeLabel="Close estimate preview"
        meta={
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">{estimate.estimateNumber}</span>
            <EstimateStatusBadge status={estimate.status} />
          </span>
        }
        actions={
          <Button size="sm" className="pointer-coarse:h-11" render={<Link href={estimate.href} />} nativeButton={false}>
            Open Estimate
            <ArrowRight data-icon="inline-end" />
          </Button>
        }
      />
      <RecordPreviewBody<PreviewData>
        url={estimatePreviewApiPath(estimate.id)}
        recordId={estimate.id}
        loadingLabel={`Loading ${estimate.estimateNumber}`}
        errorState={estimatePreviewErrorState}
      >
        {(preview) => <PreviewSections preview={preview} />}
      </RecordPreviewBody>
    </>
  )
}

const muted = (text: string) => <span className="text-muted-foreground">{text}</span>

function PreviewSections({ preview }: { preview: PreviewData }) {
  const revision = `Rev ${preview.revision}${preview.revisionCount > 1 ? ` of ${preview.revisionCount}` : ''}`
  const updated = preview.updatedAt && formatDate(preview.updatedAt) !== formatDate(preview.createdAt) ? preview.updatedAt : null
  const workflow = preview.decisionAt
    ? `Decision ${formatDate(preview.decisionAt)}${preview.decisionByName ? ` by ${preview.decisionByName}` : ''}`
    : preview.submittedAt
      ? `Sent ${formatDate(preview.submittedAt)}`
      : null

  return (
    <>
      <PreviewSection title="Summary">
        <PreviewDetails>
          <PreviewDetail label="Estimate">
            <span className="font-mono text-xs">{preview.estimateNumber}</span>
            <span className="text-muted-foreground">{` · ${revision}`}</span>
          </PreviewDetail>
          <PreviewDetail label="Project">
            {preview.project ? (
              <Link href={`/projects/${preview.project.id}`} className="rounded-sm text-link outline-none hover:text-link-hover hover:underline focus-visible:ring-2 focus-visible:ring-ring">
                {preview.project.name}
              </Link>
            ) : (
              muted('No project')
            )}
          </PreviewDetail>
          <PreviewDetail label="Client">
            {preview.client ? (
              <Link href={`/clients/${preview.client.id}`} className="rounded-sm text-link outline-none hover:text-link-hover hover:underline focus-visible:ring-2 focus-visible:ring-ring">
                {preview.client.name}
              </Link>
            ) : (
              muted('No client')
            )}
          </PreviewDetail>
          {preview.isDemo && <PreviewDetail label="Data">Demo data</PreviewDetail>}
        </PreviewDetails>
      </PreviewSection>

      <PreviewSection title="Totals">
        <PreviewDetails>
          <PreviewDetail label="Construction total">
            <span className="font-semibold tabular-nums">{formatCents(preview.constructionTotalCents)}</span>
          </PreviewDetail>
          {preview.landCostCents !== null && (
            <>
              <PreviewDetail label="Land">
                <span className="tabular-nums">{formatCents(preview.landCostCents)}</span>
              </PreviewDetail>
              <PreviewDetail label="Total with land">
                <span className="tabular-nums">{formatCents(preview.totalWithLandCents)}</span>
              </PreviewDetail>
            </>
          )}
        </PreviewDetails>
        {preview.landCostCents === null && <p className="text-xs text-muted-foreground">Land cost is not included.</p>}
      </PreviewSection>

      {preview.internal && (
        <PreviewSection title="Internal breakdown">
          <PreviewDetails>
            <PreviewDetail label="Direct cost">
              <span className="tabular-nums">{formatCents(preview.internal.directCostCents)}</span>
            </PreviewDetail>
            <PreviewDetail label="Markup">
              <span className="tabular-nums">{formatCents(preview.internal.markupCents)}</span>
              <span className="text-muted-foreground">{` · ${preview.internal.markupPercent}%`}</span>
            </PreviewDetail>
            <PreviewDetail label="Contingency">
              <span className="tabular-nums">{formatCents(preview.internal.contingencyCents)}</span>
              <span className="text-muted-foreground">{` · ${preview.internal.contingencyPercent}%`}</span>
            </PreviewDetail>
          </PreviewDetails>
        </PreviewSection>
      )}

      <PreviewSection title="Dates">
        <PreviewDetails>
          <PreviewDetail label="Created">{formatDate(preview.createdAt)}</PreviewDetail>
          {updated && <PreviewDetail label="Last updated">{formatDate(updated)}</PreviewDetail>}
          {preview.expirationDate && <PreviewDetail label="Expires">{formatDate(preview.expirationDate)}</PreviewDetail>}
          {workflow && <PreviewDetail label="Workflow">{workflow}</PreviewDetail>}
        </PreviewDetails>
      </PreviewSection>

      <div className="flex flex-wrap items-center gap-2 px-4 py-3.5">
        <Button
          variant="outline"
          size="sm"
          className="pointer-coarse:h-11"
          render={<Link href={preview.pdfHref} target="_blank" />}
          nativeButton={false}
        >
          <FileText data-icon="inline-start" />
          Download PDF
          <span className="sr-only">{` for ${preview.estimateNumber} (opens in a new tab)`}</span>
        </Button>
      </div>
    </>
  )
}
