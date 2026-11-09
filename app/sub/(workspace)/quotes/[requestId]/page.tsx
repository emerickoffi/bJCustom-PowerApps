import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import { z } from 'zod'
import { requireSubcontractor } from '@/lib/subcontractor-session'
import { createClient } from '@/lib/supabase/server'
import { formatDate, formatDateTime } from '@/lib/format'
import { QuoteForm } from '@/components/subcontract-quotes/quote-form'
import { QuoteDetails } from '@/components/subcontract-quotes/quote-details'
import { FileLink } from '@/components/subcontract-quotes/file-link'
import { ResponseBadge } from '@/components/subcontract-quotes/status-badges'
import {
  REVISION_COLUMNS,
  SELECTION_DISCLAIMER,
  formatDeadline,
  responseState,
  type QuoteDecision,
  type QuoteRevision,
  type ScopeDocument,
} from '@/lib/subcontract-quotes'
import type { SubQuoteRow } from '../page'

export const metadata: Metadata = { title: 'Quote request' }

type ScopeVersion = { version: number; scope: string; documents: ScopeDocument[]; change_summary: string | null; published_at: string }

export default async function SubQuotePage({ params }: { params: Promise<{ requestId: string }> }) {
  const session = await requireSubcontractor()
  const { requestId } = await params
  if (!z.uuid().safeParse(requestId).success) notFound()
  const supabase = await createClient()
  const { data } = await supabase.rpc('sub_quote_requests')
  const row = ((data ?? []) as (SubQuoteRow & { currency: string; current_scope_version: number; last_submitted_scope_version: number | null })[]).find(
    (r) => r.request_id === requestId,
  )
  if (!row) notFound()

  const [{ data: inv }, { data: versions }, { data: revs }, { data: events }] = await Promise.all([
    supabase.from('subcontract_quote_invitations').select('organization_id, revision_instructions, decline_reason, decision, decision_message').eq('id', row.invitation_id).maybeSingle(),
    supabase.from('subcontract_quote_scope_versions').select('version, scope, documents, change_summary, published_at').eq('request_id', requestId).order('version', { ascending: false }),
    supabase.from('subcontract_quote_revisions').select(REVISION_COLUMNS).eq('invitation_id', row.invitation_id).order('revision_number', { ascending: false }),
    supabase.from('subcontract_quote_events').select('id, event_type, message, created_at').eq('request_id', requestId).eq('company_visible', true).order('created_at', { ascending: false }).limit(50),
  ])
  const scopeVersions = (versions ?? []) as unknown as ScopeVersion[]
  const revisions = (revs ?? []) as unknown as QuoteRevision[]
  const draft = revisions.find((r) => r.status === 'draft') ?? null
  const submitted = revisions.filter((r) => r.status === 'submitted')
  const current = scopeVersions[0]
  const { data: att } = draft
    ? await supabase.from('subcontract_quote_attachments').select('id, file_name').eq('revision_id', draft.id)
    : { data: [] }
  const state = responseState(row.invitation_status, row.revision_requested_at, row.last_submitted_at)
  const decision = (inv as { decision?: QuoteDecision | null } | null)?.decision ?? null
  const decisionMessage = (inv as { decision_message?: string | null } | null)?.decision_message ?? ''
  const canEdit = row.status === 'open' && row.invitation_status === 'invited' && !decision
  const organizationId = (inv as { organization_id?: string } | null)?.organization_id ?? session.accounts[0]?.organizationId

  return (
    <>
      <div className="flex flex-col gap-1">
        <Link href="/sub/quotes" className="text-sm text-muted-foreground hover:text-foreground">All quote requests</Link>
        <h1 className="font-serif text-xl font-semibold tracking-tight text-foreground md:text-2xl">{row.title}</h1>
        <p className="text-sm text-muted-foreground">{row.project_name}{row.trade ? ` · ${row.trade}` : ''}</p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <ResponseBadge state={state} />
          <span className="text-xs text-muted-foreground">
            {row.status === 'open' ? `Due ${formatDeadline(row.response_deadline, row.deadline_timezone)}` : row.status === 'closed' ? 'Closed to responses' : 'Cancelled by builder'}
          </span>
        </div>
      </div>

      {decision === 'selected' ? (
        <p className="rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-foreground">
          <span className="font-medium">Your quote was selected.</span> The builder will contact you about next steps. {SELECTION_DISCLAIMER}
        </p>
      ) : decision === 'rejected' ? (
        <p className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground">
          <span className="font-medium">The builder did not accept your quote.</span> {decisionMessage}
        </p>
      ) : decision === 'not_selected' ? (
        <p className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground">
          <span className="font-medium">This request has been awarded to another company.</span> Thank you for quoting.
        </p>
      ) : null}

      {state === 'revision_requested' && !decision ? (
        <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <span>
            <span className="font-medium">The builder requested a revision.</span> {(inv as { revision_instructions?: string } | null)?.revision_instructions}
          </span>
        </p>
      ) : null}
      {row.last_submitted_scope_version !== null && row.last_submitted_scope_version < row.current_scope_version ? (
        <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          The scope changed after your last quote. Review version {row.current_scope_version} and submit a revised quote.
        </p>
      ) : null}

      {current ? (
        <section aria-labelledby="scope-heading" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
          <h2 id="scope-heading" className="font-serif text-lg font-semibold text-foreground">Scope of work · v{current.version}</h2>
          {current.change_summary ? <p className="text-sm text-muted-foreground">What changed: {current.change_summary}</p> : null}
          <p className="whitespace-pre-wrap text-sm text-foreground">{current.scope}</p>
          {current.documents.length ? (
            <ul className="flex flex-col">
              {current.documents.map((d) => (
                <li key={d.version_id}>
                  <FileLink kind="document" requestId={requestId} versionId={d.version_id} label={`${d.name} (v${d.version_number})`} />
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-xs text-muted-foreground">Published {formatDateTime(current.published_at)} · amounts in {row.currency}</p>
        </section>
      ) : null}

      {canEdit ? (
        <section aria-labelledby="quote-heading" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
          <h2 id="quote-heading" className="font-serif text-lg font-semibold text-foreground">
            {submitted.length ? `Revised quote (revision ${submitted[0].revision_number + 1})` : 'Your quote'}
          </h2>
          <QuoteForm
            requestId={requestId}
            invitationId={row.invitation_id}
            organizationId={organizationId}
            currency={row.currency}
            scopeVersion={row.current_scope_version}
            draft={draft}
            basis={submitted[0] ?? null}
            attachments={(att ?? []) as { id: string; file_name: string }[]}
          />
        </section>
      ) : row.invitation_status === 'declined' ? (
        <p className="text-sm text-muted-foreground">You declined this request. {(inv as { decline_reason?: string } | null)?.decline_reason}</p>
      ) : null}

      {submitted.length ? (
        <section aria-labelledby="submitted-heading" className="flex flex-col gap-3">
          <h2 id="submitted-heading" className="font-serif text-lg font-semibold text-foreground">Submitted revisions</h2>
          {submitted.map((r) => (
            <div key={r.id} className="rounded-xl border border-border bg-card p-4">
              <QuoteDetails revision={r} currency={row.currency} />
            </div>
          ))}
        </section>
      ) : null}

      {(events ?? []).length ? (
        <section aria-labelledby="activity-heading" className="flex flex-col gap-2">
          <h2 id="activity-heading" className="font-serif text-lg font-semibold text-foreground">Activity</h2>
          <ol className="flex flex-col gap-2">
            {(events as { id: string; event_type: string; message: string | null; created_at: string }[]).map((e) => (
              <li key={e.id} className="text-sm">
                <span className="text-foreground">{e.message || e.event_type.replace(/_/g, ' ')}</span>
                <span className="block text-xs text-muted-foreground">{formatDate(e.created_at)}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </>
  )
}
