'use client'

import { useState, useTransition } from 'react'
import { Download, FileText } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  builderSignoffAction,
  generateWalkthroughReportAction,
  updateReportWorkflowAction,
  type ReportActionResult,
} from '@/app/actions/reports'
import { formatDateTime } from '@/lib/format'

export type StaffReport = {
  id: string
  version: number
  sha256: string
  size_bytes: number
  outstanding_issue_count: number
  generated_at: string
  published_at: string | null
  acknowledgment_requested_at: string | null
  signoff_requested_at: string | null
  acknowledgments: { signer_name: string; decision: string; comment: string | null; created_at: string }[]
  signoffs: { decision: 'verified' | 'rejected'; comment: string | null; created_at: string; reviewer: string }[]
}

const DECISION_LABELS: Record<string, string> = {
  acknowledged: 'Acknowledged receipt',
  accepted: 'Accepted',
  changes_requested: 'Requested changes',
}

function Feedback({ result }: { result: ReportActionResult | null }) {
  if (!result) return null
  return (
    <p role="status" className={result.ok ? 'text-sm text-foreground' : 'text-sm text-destructive'}>
      {result.message}
    </p>
  )
}

function ReportCard({ report, canManage, isLatest }: { report: StaffReport; canManage: boolean; isLatest: boolean }) {
  const [pending, start] = useTransition()
  const [result, setResult] = useState<ReportActionResult | null>(null)
  const [comment, setComment] = useState('')
  const run = (fn: () => Promise<ReportActionResult>) => start(async () => setResult(await fn()))
  const latestSignoff = report.signoffs[0]

  return (
    <li className="flex flex-col gap-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="flex items-center gap-2 font-medium text-foreground">
            <FileText className="size-4 text-muted-foreground" aria-hidden="true" />
            Version {report.version}
            {isLatest && <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Latest</span>}
            <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
              {report.published_at ? 'Published' : 'Internal only'}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            Generated {formatDateTime(report.generated_at)} · {report.outstanding_issue_count} outstanding issue
            {report.outstanding_issue_count === 1 ? '' : 's'} · fingerprint{' '}
            <span className="font-mono">{report.sha256.slice(0, 12)}</span>
          </p>
        </div>
        <a href={`/api/reports/${report.id}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          <Download className="size-4" aria-hidden="true" />
          Download PDF
        </a>
      </div>

      {canManage && (
        <div className="flex flex-wrap gap-2">
          {!report.published_at && (
            <Button size="sm" disabled={pending} onClick={() => run(() => updateReportWorkflowAction(report.id, 'publish'))}>
              Publish to homeowner
            </Button>
          )}
          {report.published_at && !report.acknowledgment_requested_at && (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => updateReportWorkflowAction(report.id, 'request_acknowledgment'))}>
              Request acknowledgment
            </Button>
          )}
          {report.published_at && !report.signoff_requested_at && (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => updateReportWorkflowAction(report.id, 'request_signoff'))}>
              Request final sign-off
            </Button>
          )}
        </div>
      )}

      <dl className="grid gap-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted-foreground">Published</dt>
          <dd>{report.published_at ? formatDateTime(report.published_at) : 'Not yet'}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Acknowledgment requested</dt>
          <dd>{report.acknowledgment_requested_at ? formatDateTime(report.acknowledgment_requested_at) : 'No'}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Final sign-off requested</dt>
          <dd>{report.signoff_requested_at ? formatDateTime(report.signoff_requested_at) : 'No'}</dd>
        </div>
      </dl>

      <div className="flex flex-col gap-2 border-t pt-3">
        <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Homeowner responses</h4>
        {report.acknowledgments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No response yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {report.acknowledgments.map((a) => (
              <li key={a.created_at} className="text-sm">
                <span className="font-medium">{DECISION_LABELS[a.decision] ?? a.decision}</span> by {a.signer_name} ·{' '}
                <span className="text-muted-foreground">{formatDateTime(a.created_at)}</span>
                {a.comment && <p className="mt-1 whitespace-pre-line text-muted-foreground">{a.comment}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t pt-3">
        <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Builder verification</h4>
        {latestSignoff ? (
          <p className="text-sm">
            <span className="font-medium">{latestSignoff.decision === 'verified' ? 'Verified' : 'Not verified'}</span> by {latestSignoff.reviewer} ·{' '}
            <span className="text-muted-foreground">{formatDateTime(latestSignoff.created_at)}</span>
            {latestSignoff.comment && <span className="mt-1 block whitespace-pre-line text-muted-foreground">{latestSignoff.comment}</span>}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Not yet reviewed.</p>
        )}
        {canManage && (
          <div className="flex flex-col gap-2">
            <label htmlFor={`signoff-${report.id}`} className="sr-only">
              Verification comment
            </label>
            <textarea
              id={`signoff-${report.id}`}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={2000}
              rows={2}
              placeholder="Comment (required when not verifying)"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => builderSignoffAction(report.id, 'verified', comment))}>
                Verify report
              </Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => builderSignoffAction(report.id, 'rejected', comment))}>
                Mark not verified
              </Button>
            </div>
          </div>
        )}
      </div>
      <Feedback result={result} />
    </li>
  )
}

export function StaffReportsPanel({
  walkthroughId,
  submitted,
  canManage,
  reports,
}: {
  walkthroughId: string
  submitted: boolean
  canManage: boolean
  reports: StaffReport[]
}) {
  const [pending, start] = useTransition()
  const [result, setResult] = useState<ReportActionResult | null>(null)

  return (
    <section aria-labelledby="reports-heading" className="flex flex-col gap-4 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="reports-heading" className="font-serif text-xl font-semibold text-foreground">
            Walkthrough reports
          </h2>
          <p className="text-sm text-muted-foreground">
            Each version is a fixed PDF snapshot. Generate a new version to reflect later changes; earlier versions are kept.
          </p>
        </div>
        {canManage && (
          <Button disabled={!submitted || pending} onClick={() => start(async () => setResult(await generateWalkthroughReportAction(walkthroughId)))}>
            {pending ? 'Generating…' : reports.length ? 'Generate new version' : 'Generate report'}
          </Button>
        )}
      </div>
      {!submitted && <p className="text-sm text-muted-foreground">A report can be generated once the homeowner submits this walkthrough.</p>}
      <Feedback result={result} />
      {reports.length > 0 && (
        <ul className="flex flex-col gap-3">
          {reports.map((r, i) => (
            <ReportCard key={r.id} report={r} canManage={canManage} isLatest={i === 0} />
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        Homeowner responses are recorded with their typed name, time, report version and document fingerprint. A legally binding
        e-signature requires an e-signature provider, which is not configured.
      </p>
    </section>
  )
}
