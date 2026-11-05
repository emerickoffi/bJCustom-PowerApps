'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, Copy, FileWarning, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/lib/format'
import { formatMoney } from '@/lib/subcontract-quotes'
import { analyzeQuotesAction } from '@/app/actions/subcontract-quote-analysis'
import {
  QUOTE_ANALYSIS_LABEL,
  QUOTE_ANALYSIS_MAX_QUOTES,
  QUOTE_ANALYSIS_MIGRATION,
  REVISION_PREFILL_EVENT,
  type AiReviewState,
  type AnalysisEvidence,
  type AnalysisPoint,
  type RevisionPrefillDetail,
  type SavedAnalysis,
} from '@/lib/ai/quote-analysis'

const SECTIONS = [
  { key: 'summary', title: 'Summary' },
  { key: 'differences', title: 'Material differences' },
  { key: 'scope_gaps', title: 'Possible scope gaps and exclusions' },
  { key: 'allowances_uncertain', title: 'Allowances and uncertain items' },
  { key: 'availability', title: 'Availability and schedule' },
] as const

function Evidence({ items }: { items: AnalysisEvidence[] }) {
  return (
    <details className="group mt-1">
      <summary className="cursor-pointer text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
        Evidence ({items.length})
      </summary>
      <ul className="mt-2 flex flex-col gap-2 border-l-2 border-border pl-3">
        {items.map((e) => (
          <li key={e.key} className="flex flex-col gap-0.5 text-xs">
            <span className="font-medium text-foreground">
              {[e.company ?? 'Request', e.revision !== null ? `revision ${e.revision}` : null, e.field].filter(Boolean).join(' · ')}
            </span>
            {e.attachment ? <span className="text-muted-foreground">File: {e.attachment}</span> : null}
            <span className="whitespace-pre-wrap text-muted-foreground">{e.excerpt}</span>
          </li>
        ))}
      </ul>
    </details>
  )
}

function BasisTag({ basis }: { basis: AnalysisPoint['basis'] }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium leading-none',
        basis === 'submitted_fact' ? 'bg-muted text-foreground' : 'bg-accent text-accent-foreground',
      )}
    >
      {basis === 'submitted_fact' ? 'Submitted' : 'Interpretation'}
    </span>
  )
}

function Points({ points }: { points: AnalysisPoint[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {points.map((p, i) => (
        <li key={i} className="flex flex-col">
          <div className="flex items-start gap-2">
            <BasisTag basis={p.basis} />
            <p className="text-sm text-foreground">{p.text}</p>
          </div>
          <Evidence items={p.evidence} />
        </li>
      ))}
    </ul>
  )
}

function QuestionActions({ invitationId, text, canApply }: { invitationId: string; text: string; canApply: boolean }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          } catch {
            setCopied(false)
          }
        }}
      >
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        {copied ? 'Copied' : 'Copy'}
      </Button>
      {canApply ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            window.dispatchEvent(new CustomEvent<RevisionPrefillDetail>(REVISION_PREFILL_EVENT, { detail: { invitationId, text } }))
          }
        >
          Add to revision request
        </Button>
      ) : null}
    </div>
  )
}

function Result({ analysis, currency, ai }: { analysis: SavedAnalysis; currency: string | null; ai: AiReviewState }) {
  const r = analysis.result
  const removed = r.removed.unsupported + r.removed.unverified_figures + r.removed.prohibited_claims
  const rec = r.recommendation
  return (
    <div className="flex flex-col gap-5">
      <p className="text-xs text-muted-foreground">
        Covers {r.quotes.map((q) => `${q.company} (revision ${q.revision}, total payable ${q.total_payable === null ? 'not determinable' : formatMoney(q.total_payable, currency)})`).join('; ')}.
        Generated {formatDateTime(analysis.createdAt)}.
      </p>

      <section aria-labelledby="ai-rec-heading" className="flex flex-col gap-2 rounded-md border border-border bg-muted/40 p-3">
        <h4 id="ai-rec-heading" className="text-sm font-semibold text-foreground">
          {rec.status === 'supported' ? `Suggested for review: ${rec.company}` : 'No recommendation — evidence is insufficient'}
        </h4>
        <p className="text-xs text-muted-foreground">A suggestion only. It does not select, reject, or notify anyone.</p>
        {rec.rationale.length ? <Points points={rec.rationale} /> : null}
        {rec.tradeoffs.length ? (
          <div className="flex flex-col gap-2">
            <h5 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tradeoffs</h5>
            <Points points={rec.tradeoffs} />
          </div>
        ) : null}
      </section>

      {SECTIONS.map((s) =>
        r.sections[s.key].length ? (
          <section key={s.key} aria-labelledby={`ai-${s.key}`} className="flex flex-col gap-2">
            <h4 id={`ai-${s.key}`} className="text-sm font-semibold text-foreground">
              {s.title}
            </h4>
            <Points points={r.sections[s.key]} />
          </section>
        ) : null,
      )}

      {r.questions.length ? (
        <section aria-labelledby="ai-questions" className="flex flex-col gap-3">
          <h4 id="ai-questions" className="text-sm font-semibold text-foreground">
            Suggested questions
          </h4>
          <p className="text-xs text-muted-foreground">Nothing is sent automatically. Adding a question opens that company’s revision form so you can edit it before sending.</p>
          {r.questions.map((g) => (
            <div key={g.invitation_id} className="flex flex-col gap-2">
              <h5 className="text-sm font-medium text-foreground">
                {g.company} <span className="font-normal text-muted-foreground">· revision {g.revision}</span>
              </h5>
              <ul className="flex flex-col gap-3">
                {g.items.map((q, i) => (
                  <li key={i} className="flex flex-col gap-1 rounded-md border border-border p-3">
                    <p className="text-sm text-foreground">{q.text}</p>
                    <Evidence items={q.evidence} />
                    <QuestionActions invitationId={g.invitation_id} text={q.text} canApply={ai.revisionTargets.includes(g.invitation_id)} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : null}

      {r.missing_information.length ? (
        <section aria-labelledby="ai-missing" className="flex flex-col gap-2">
          <h4 id="ai-missing" className="text-sm font-semibold text-foreground">
            Missing information
          </h4>
          <p className="text-xs text-muted-foreground">Checked by the app, not the AI. Missing values are unknown, never zero.</p>
          <ul className="flex flex-col gap-1 text-sm">
            {r.missing_information.map((m) => (
              <li key={m.company}>
                <span className="font-medium text-foreground">{m.company}</span>
                <span className="text-muted-foreground"> (revision {m.revision}): {m.fields.join(', ')}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {r.unread_documents.length ? (
        <section aria-labelledby="ai-unread" className="flex flex-col gap-2">
          <h4 id="ai-unread" className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <FileWarning className="size-4 text-warning" aria-hidden="true" /> Documents not read
          </h4>
          <p className="text-xs text-muted-foreground">{r.unread_documents[0].reason}</p>
          <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
            {r.unread_documents.map((d, i) => (
              <li key={i}>
                {d.name}
                {d.company ? ` — ${d.company}, revision ${d.revision}` : ' — scope document'}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {removed ? (
        <p className="text-xs text-muted-foreground">
          {removed} AI statement{removed === 1 ? ' was' : 's were'} removed before display because {[
            r.removed.unsupported && 'they had no valid evidence',
            r.removed.unverified_figures && 'they mentioned amounts not found in the records',
            r.removed.prohibited_claims && 'they made score or savings claims',
          ]
            .filter(Boolean)
            .join(', or ')}
          .
        </p>
      ) : null}
    </div>
  )
}

export function QuoteAnalysisPanel({
  projectId,
  requestId,
  selectedIds,
  selectedNames,
  currency,
  ai,
}: {
  projectId: string
  requestId: string
  selectedIds: string[]
  selectedNames: string[]
  currency: string | null
  ai: AiReviewState
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<{ message: string; retryable: boolean } | null>(null)
  const [fresh, setFresh] = useState<{ analysis: SavedAnalysis; saved: boolean } | null>(null)

  const showFresh = fresh && (!ai.saved || ai.saved.analysis.id !== fresh.analysis.id || fresh.analysis.id === null)
  const analysis = showFresh ? fresh.analysis : ai.saved?.analysis ?? null
  const outdated = showFresh ? [] : ai.saved?.outdated ?? []
  const differentSet =
    !!analysis && (analysis.invitationIds.length !== selectedIds.length || analysis.invitationIds.some((id) => !selectedIds.includes(id)))

  const tooFew = selectedIds.length < 2
  const tooMany = selectedIds.length > QUOTE_ANALYSIS_MAX_QUOTES
  const blocked =
    ai.availability === 'disabled'
      ? 'AI assistance is turned off for your company. An administrator can enable it in Settings → Features.'
      : ai.availability === 'unconfigured'
        ? 'AI assistance is not configured in this environment. The manual comparison above still works.'
        : null

  function run() {
    setError(null)
    start(async () => {
      const r = await analyzeQuotesAction(projectId, requestId, selectedIds)
      if (!r.ok) {
        setError({ message: r.error, retryable: r.retryable })
        return
      }
      setFresh({ analysis: r.analysis, saved: r.saved })
      router.refresh()
    })
  }

  return (
    <section aria-labelledby="ai-review-heading" className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 id="ai-review-heading" className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Sparkles className="size-4 text-primary" aria-hidden="true" /> AI quote review
          </h3>
          <p className="text-xs font-medium text-warning">{QUOTE_ANALYSIS_LABEL}</p>
          <p className="text-xs text-muted-foreground">
            Uses the selected companies’ latest submitted revisions, the published scope, and qualification summaries. Internal to your team; never shown to subcontractors.
          </p>
        </div>
        <Button type="button" size="sm" onClick={run} disabled={pending || tooFew || tooMany || !!blocked}>
          {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : analysis ? <RefreshCw aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
          {pending ? 'Analyzing…' : analysis ? 'Analyze again' : `Analyze ${selectedIds.length} quotes`}
        </Button>
      </div>

      <div aria-live="polite" className="flex flex-col gap-3">
        {blocked ? <p className="text-sm text-muted-foreground">{blocked}</p> : null}
        {!blocked && tooFew ? <p className="text-sm text-muted-foreground">Select at least two companies above to analyze.</p> : null}
        {!blocked && tooMany ? <p className="text-sm text-muted-foreground">Select at most {QUOTE_ANALYSIS_MAX_QUOTES} companies to analyze.</p> : null}
        {!ai.migrationReady ? (
          <p className="text-xs text-muted-foreground">Analyses are not saved until the {QUOTE_ANALYSIS_MIGRATION} migration is applied.</p>
        ) : null}
        {pending ? <p className="text-sm text-muted-foreground">Analyzing {selectedNames.join(', ')}. This can take up to a minute.</p> : null}
        {error ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
            <span className="flex-1">{error.message}</span>
            {error.retryable ? (
              <Button type="button" size="sm" variant="outline" onClick={run} disabled={pending || tooFew || tooMany}>
                Retry
              </Button>
            ) : null}
          </div>
        ) : null}
        {fresh && !fresh.saved && showFresh ? <p className="text-xs text-muted-foreground">This analysis was not saved and will disappear when you leave the page.</p> : null}
        {analysis && outdated.length ? (
          <div role="status" className="flex flex-col gap-1 rounded-md border border-warning/50 bg-warning/10 p-3 text-sm">
            <p className="flex items-center gap-1.5 font-medium text-foreground">
              <AlertTriangle className="size-4 text-warning" aria-hidden="true" /> Outdated — the quotes or records changed after this analysis
            </p>
            <ul className="list-disc pl-5 text-xs text-muted-foreground">
              {outdated.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">Do not rely on it. Analyze again to review the current quotes.</p>
          </div>
        ) : null}
        {analysis && differentSet && !outdated.length ? (
          <p className="text-xs text-muted-foreground">This analysis covers a different set of companies than you have selected.</p>
        ) : null}
      </div>

      {analysis ? (
        <div className={cn(outdated.length && 'opacity-70')}>
          <Result analysis={analysis} currency={currency} ai={ai} />
        </div>
      ) : null}
    </section>
  )
}
