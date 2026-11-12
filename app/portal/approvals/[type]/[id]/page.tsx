import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { z } from 'zod'
import { FileCheck2 } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { SemanticBadge } from '@/components/shared/semantic-badge'
import { ApprovalDecisionForm } from '@/components/portal/approval-decision-form'
import { getPortalApprovalDetail } from '@/lib/portal-approvals-data'
import {
  APPROVAL_DECISION_LABELS,
  APPROVAL_STATUS_LABELS,
  APPROVAL_STATUS_TONES,
  DOCUMENT_TYPE_LABELS,
  formatScheduleImpact,
  formatSignedCents,
  isApprovalDocumentType,
  type ApprovalDetail,
  type ChangeOrderApprovalDetail,
  type EstimateApprovalDetail,
} from '@/lib/portal-approvals'
import { formatCentsExact } from '@/lib/estimates'
import { formatDate, formatDateTime } from '@/lib/format'

type Params = Promise<{ type: string; id: string }>

async function load(params: Params) {
  const { type, id } = await params
  if (!isApprovalDocumentType(type) || !z.uuid().safeParse(id).success) return null
  return getPortalApprovalDetail(type, id)
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const doc = await load(params)
  return { title: doc ? `${DOCUMENT_TYPE_LABELS[doc.document_type]} ${doc.number}` : 'Approval' }
}

function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={strong ? 'text-base font-semibold tabular-nums text-foreground' : 'text-sm tabular-nums text-foreground'}>{value}</dd>
    </div>
  )
}

function EstimateBody({ doc }: { doc: EstimateApprovalDetail }) {
  const t = doc.totals
  const fees = t.markup_cents + t.contingency_cents
  return (
    <>
      <section aria-labelledby="scope-heading" className="surface flex flex-col gap-4 p-5 md:p-6">
        <h2 id="scope-heading" className="type-section-title text-foreground">
          Scope and pricing
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-sm">
            <caption className="sr-only">Estimate line items</caption>
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th scope="col" className="py-2 pr-3 font-medium">
                  Item
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Quantity
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {doc.lines.map((line, i) => (
                <tr key={i} className="border-b border-border/60 align-top last:border-0">
                  <td className="py-3 pr-3">
                    <span className="block font-medium text-foreground">{line.description}</span>
                    <span className="text-xs text-muted-foreground">
                      {line.category}
                      {line.is_allowance ? ' · Allowance' : ''}
                    </span>
                    {line.notes && <span className="mt-1 block text-xs text-muted-foreground">{line.notes}</span>}
                  </td>
                  <td className="py-3 pr-3 tabular-nums text-muted-foreground">{`${Number(line.quantity)} ${line.unit}`}</td>
                  <td className="py-3 text-right tabular-nums text-foreground">{formatCentsExact(line.line_total_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="ml-auto flex w-full max-w-sm flex-col divide-y border-t pt-2">
          <SummaryRow label="Construction items" value={formatCentsExact(t.direct_cost_cents)} />
          {t.allowance_cents > 0 && <SummaryRow label="Allowances" value={formatCentsExact(t.allowance_cents)} />}
          {fees > 0 && <SummaryRow label="Builder fee and contingency" value={formatCentsExact(fees)} />}
          <SummaryRow label="Construction total" value={formatCentsExact(t.construction_total_cents)} />
          {(t.land_cost_cents ?? 0) > 0 && <SummaryRow label="Land" value={formatCentsExact(t.land_cost_cents)} />}
          <SummaryRow label="Total" value={formatCentsExact(t.total_with_land_cents)} strong />
        </dl>
      </section>
    </>
  )
}

function ChangeOrderBody({ doc }: { doc: ChangeOrderApprovalDetail }) {
  const c = doc.contract
  return (
    <section aria-labelledby="impact-heading" className="surface flex flex-col gap-4 p-5 md:p-6">
      <h2 id="impact-heading" className="type-section-title text-foreground">
        What this changes
      </h2>
      {doc.reason && (
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium text-foreground">Reason</h3>
          <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{doc.reason}</p>
        </div>
      )}
      <dl className="flex w-full max-w-md flex-col divide-y">
        <SummaryRow label="Price change" value={formatSignedCents(doc.amount_cents, formatCentsExact)} strong />
        <SummaryRow label="Schedule" value={formatScheduleImpact(doc.schedule_impact_days)} />
        {c.original_cents !== null && doc.status === 'pending' && (
          <>
            <SummaryRow label="Original contract" value={formatCentsExact(c.original_cents)} />
            {c.approved_changes_cents !== 0 && (
              <SummaryRow label="Approved changes so far" value={formatSignedCents(c.approved_changes_cents, formatCentsExact)} />
            )}
            <SummaryRow label="Contract if approved" value={formatCentsExact((c.current_cents ?? 0) + doc.amount_cents)} strong />
          </>
        )}
      </dl>
    </section>
  )
}

function DecisionPanel({ doc }: { doc: ApprovalDetail }) {
  const label = doc.document_type === 'estimate' ? 'estimate' : 'change order'
  if (doc.status === 'pending') {
    if (doc.signature_in_progress) {
      return (
        <p className="text-sm leading-relaxed text-muted-foreground">
          {'This estimate was sent to you for electronic signature. Sign or decline it from '}
          <Link href={`/portal/projects/${doc.project_id}/documents`} className="font-medium text-link underline-offset-4 hover:underline">
            Documents & signatures
          </Link>
          {' so there is one record of your decision.'}
        </p>
      )
    }
    if (!doc.can_sign) {
      return (
        <p className="text-sm leading-relaxed text-muted-foreground">
          Your portal access lets you review this document but not approve it. Another homeowner on the project, or your builder, can record the decision.
        </p>
      )
    }
    const amount = doc.document_type === 'change_order' ? formatSignedCents(doc.amount_cents, formatCentsExact) : formatCentsExact(doc.amount_cents)
    return (
      <ApprovalDecisionForm
        type={doc.document_type}
        id={doc.id}
        revision={doc.revision}
        amountCents={doc.amount_cents}
        amountLabel={amount}
        documentLabel={label}
      />
    )
  }
  if (doc.status === 'superseded') {
    return <p className="text-sm text-muted-foreground">Your builder sent a newer version of this estimate. Open Approvals to review the latest one.</p>
  }
  if (doc.status === 'in_revision') {
    return <p className="text-sm text-muted-foreground">Your builder is revising this change order based on your feedback. You will be notified when the new version is ready.</p>
  }
  return (
    <dl className="flex flex-col divide-y">
      <SummaryRow label="Decision" value={APPROVAL_STATUS_LABELS[doc.status]} />
      {doc.decision_by_name && <SummaryRow label="Recorded for" value={doc.decision_by_name} />}
      {doc.decision_at && <SummaryRow label="Date" value={formatDate(doc.decision_at)} />}
      {doc.decision_method && (
        <SummaryRow label="How" value={doc.decision_method === 'homeowner_portal' ? 'Homeowner portal' : 'Recorded by your builder'} />
      )}
    </dl>
  )
}

export default async function PortalApprovalDetailPage({ params }: { params: Params }) {
  const doc = await load(params)
  if (!doc) notFound()

  return (
    <div className="flex w-full min-w-0 flex-col gap-5 md:gap-6">
      <PageHeader
        icon={FileCheck2}
        title={doc.title}
        backHref="/portal/approvals"
        backLabel="Approvals"
        meta={
          <span className="flex flex-wrap items-center gap-2">
            <span>
              {DOCUMENT_TYPE_LABELS[doc.document_type]} <span className="font-mono">{doc.number}</span> · {doc.project_name}
            </span>
            <SemanticBadge tone={APPROVAL_STATUS_TONES[doc.status]}>{APPROVAL_STATUS_LABELS[doc.status]}</SemanticBadge>
          </span>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-5">
          {doc.description && (
            <section aria-labelledby="desc-heading" className="surface flex flex-col gap-2 p-5 md:p-6">
              <h2 id="desc-heading" className="type-section-title text-foreground">
                Description
              </h2>
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{doc.description}</p>
            </section>
          )}
          {doc.document_type === 'estimate' ? <EstimateBody doc={doc} /> : <ChangeOrderBody doc={doc} />}

          {doc.history.length > 0 && (
            <section aria-labelledby="record-heading" className="surface flex flex-col gap-3 p-5 md:p-6">
              <h2 id="record-heading" className="type-section-title text-foreground">
                Decision record
              </h2>
              <ol className="flex flex-col gap-3">
                {doc.history.map((h) => (
                  <li key={`${h.revision}:${h.decided_at}`} className="flex flex-col gap-1 rounded-xl border border-border/70 p-4">
                    <span className="text-sm font-medium text-foreground">
                      {`${APPROVAL_DECISION_LABELS[h.decision]} · version ${h.revision}`}
                    </span>
                    <span className="text-xs text-muted-foreground">{`${h.decided_by_name} · ${formatDateTime(h.decided_at)}`}</span>
                    {h.comment && <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-foreground">{h.comment}</p>}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>

        <aside aria-labelledby="decide-heading" className="surface flex flex-col gap-4 p-5 md:p-6 lg:sticky lg:top-24">
          <div className="flex flex-col gap-1">
            <h2 id="decide-heading" className="type-section-title text-foreground">
              {doc.status === 'pending' ? 'Your decision' : 'Status'}
            </h2>
            {doc.sent_at && <p className="text-xs text-muted-foreground">{`Sent ${formatDate(doc.sent_at)}`}</p>}
            {doc.document_type === 'estimate' && doc.expiration_date && doc.status === 'pending' && (
              <p className="text-xs text-muted-foreground">{`Valid until ${formatDate(doc.expiration_date)}`}</p>
            )}
          </div>
          <DecisionPanel doc={doc} />
        </aside>
      </div>
    </div>
  )
}
