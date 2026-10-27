'use client'

import { useState, useTransition } from 'react'
import { Download } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { homeownerAcknowledgeAction, type ReportActionResult } from '@/app/actions/reports'
import { formatDateTime } from '@/lib/format'

type Decision = 'acknowledged' | 'accepted' | 'changes_requested'
const LABELS: Record<string, string> = {
  acknowledged: 'You acknowledged receipt',
  accepted: 'You accepted this report',
  changes_requested: 'You requested changes',
}

export function HomeownerReportCard({
  report,
  responses,
}: {
  report: { id: string; version: number; sha256: string; publishedAt: string; approvalRequested: boolean; isLatest: boolean }
  responses: { decision: string; signer_name: string; created_at: string }[]
}) {
  const [pending, start] = useTransition()
  const [result, setResult] = useState<ReportActionResult | null>(null)
  const [name, setName] = useState('')
  const [comment, setComment] = useState('')
  const [decision, setDecision] = useState<Decision>(report.approvalRequested ? 'accepted' : 'acknowledged')
  const options: Decision[] = report.approvalRequested ? ['accepted', 'changes_requested', 'acknowledged'] : ['acknowledged']

  return (
    <li className="flex flex-col gap-4 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="font-medium text-foreground">
            Report version {report.version}
            {!report.isLatest && <span className="ml-2 text-xs text-muted-foreground">(superseded)</span>}
          </p>
          <p className="text-xs text-muted-foreground">Shared {formatDateTime(report.publishedAt)}</p>
        </div>
        <a href={`/api/reports/${report.id}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          <Download className="size-4" aria-hidden="true" />
          Download PDF
        </a>
      </div>

      {responses.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm">
          {responses.map((r) => (
            <li key={r.created_at}>
              {LABELS[r.decision] ?? r.decision} as {r.signer_name} · <span className="text-muted-foreground">{formatDateTime(r.created_at)}</span>
            </li>
          ))}
        </ul>
      )}

      {report.isLatest && (
        <form
          className="flex flex-col gap-3 border-t pt-4"
          onSubmit={(e) => {
            e.preventDefault()
            start(async () => {
              const res = await homeownerAcknowledgeAction(report.id, decision, name, comment)
              setResult(res)
              if (res.ok) setComment('')
            })
          }}
        >
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-foreground">
              {report.approvalRequested ? 'Your builder has asked you to review and sign off on this report' : 'Confirm you received this report'}
            </legend>
            {options.length > 1 &&
              options.map((o) => (
                <label key={o} className="flex items-center gap-2 text-sm">
                  <input type="radio" name={`decision-${report.id}`} value={o} checked={decision === o} onChange={() => setDecision(o)} />
                  {o === 'accepted' ? 'I accept this report' : o === 'changes_requested' ? 'I need changes' : 'I only acknowledge receipt'}
                </label>
              ))}
          </fieldset>
          {decision === 'changes_requested' && (
            <div className="flex flex-col gap-1">
              <label htmlFor={`comment-${report.id}`} className="text-sm font-medium">
                What needs to change?
              </label>
              <textarea
                id={`comment-${report.id}`}
                required
                maxLength={2000}
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label htmlFor={`name-${report.id}`} className="text-sm font-medium">
              Type your full name to sign
            </label>
            <input
              id={`name-${report.id}`}
              required
              minLength={2}
              maxLength={160}
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-10 rounded-md border bg-background px-3 text-sm"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Your name, the time, and this report&apos;s version and fingerprint ({report.sha256.slice(0, 12)}) are recorded with your response.
          </p>
          <Button type="submit" disabled={pending} className="w-fit">
            {pending ? 'Saving…' : 'Submit response'}
          </Button>
          {result && (
            <p role="status" className={result.ok ? 'text-sm text-foreground' : 'text-sm text-destructive'}>
              {result.message}
            </p>
          )}
        </form>
      )}
    </li>
  )
}
