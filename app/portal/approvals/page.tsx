import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight, FileCheck2 } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { SemanticBadge } from '@/components/shared/semantic-badge'
import { getPortalApprovals } from '@/lib/portal-approvals-data'
import {
  APPROVAL_STATUS_LABELS,
  APPROVAL_STATUS_TONES,
  DOCUMENT_TYPE_LABELS,
  approvalHref,
  formatSignedCents,
  type ApprovalListItem,
} from '@/lib/portal-approvals'
import { formatCentsExact } from '@/lib/estimates'
import { formatDate } from '@/lib/format'

export const metadata: Metadata = { title: 'Approvals' }

function ApprovalRow({ item, showProject }: { item: ApprovalListItem; showProject: boolean }) {
  const amount =
    item.document_type === 'change_order' ? formatSignedCents(item.amount_cents, formatCentsExact) : formatCentsExact(item.amount_cents)
  const when =
    item.status === 'pending'
      ? item.sent_at && `Sent ${formatDate(item.sent_at)}`
      : item.decision_at && `${APPROVAL_STATUS_LABELS[item.status]} ${formatDate(item.decision_at)}${item.decision_by_name ? ` by ${item.decision_by_name}` : ''}`
  return (
    <Link
      href={approvalHref(item.document_type, item.id)}
      className="surface group flex flex-wrap items-center justify-between gap-3 p-5 transition-colors hover:border-primary/40"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">
          {DOCUMENT_TYPE_LABELS[item.document_type]} · <span className="font-mono">{item.number}</span>
        </span>
        <span className="truncate font-medium text-foreground">{item.title}</span>
        <span className="text-sm text-muted-foreground">{[showProject ? item.project_name : null, when].filter(Boolean).join(' · ')}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-medium tabular-nums text-foreground">{amount}</span>
        <SemanticBadge tone={APPROVAL_STATUS_TONES[item.status]}>{APPROVAL_STATUS_LABELS[item.status]}</SemanticBadge>
        <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </div>
    </Link>
  )
}

export default async function PortalApprovalsPage() {
  const items = await getPortalApprovals()
  const pending = items.filter((i) => i.status === 'pending')
  const past = items.filter((i) => i.status !== 'pending')
  const showProject = new Set(items.map((i) => i.project_id)).size > 1

  return (
    <div className="flex w-full min-w-0 flex-col gap-6 md:gap-8">
      <PageHeader
        icon={FileCheck2}
        title="Approvals"
        count={{ value: pending.length, noun: 'waiting' }}
        backHref="/portal"
        backLabel="Your home"
        meta={<span>Review estimates and change orders from your builder, and keep a record of every decision.</span>}
      />

      <section aria-labelledby="pending-heading" className="flex flex-col gap-3">
        <h2 id="pending-heading" className="type-section-title text-foreground">
          Waiting for your decision
        </h2>
        {pending.length === 0 ? (
          <p className="surface p-6 text-sm text-muted-foreground">Nothing needs your approval right now.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {pending.map((item) => (
              <li key={`${item.document_type}:${item.id}`}>
                <ApprovalRow item={item} showProject={showProject} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {past.length > 0 && (
        <section aria-labelledby="history-heading" className="flex flex-col gap-3">
          <h2 id="history-heading" className="type-section-title text-foreground">
            Decision history
          </h2>
          <ul className="flex flex-col gap-3">
            {past.map((item) => (
              <li key={`${item.document_type}:${item.id}:${item.revision}:${item.status}`}>
                <ApprovalRow item={item} showProject={showProject} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
