import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertTriangle, ArrowLeft, FileSpreadsheet } from 'lucide-react'
import { z } from 'zod'
import { requireManager } from '@/lib/session'
import { requireFeature } from '@/lib/features'
import { createClient } from '@/lib/supabase/server'
import { formatDate, formatDateTime } from '@/lib/format'
import { PageHeader, Surface } from '@/components/shared/page-header'
import { RequestForm } from '@/components/subcontract-quotes/request-form'
import { RequestControls, RevisionRequestButton } from '@/components/subcontract-quotes/request-controls'
import { DecisionBadge, RequestStatusBadge, ResponseBadge } from '@/components/subcontract-quotes/status-badges'
import { FileLink } from '@/components/subcontract-quotes/file-link'
import { QuoteDetails } from '@/components/subcontract-quotes/quote-details'
import { QuoteComparison, type CompareEntry } from '@/components/subcontract-quotes/quote-comparison'
import {
  CommitmentPanel,
  RejectQuoteButton,
  ReviewNoteForm,
  SelectQuoteButton,
  type SelectCandidate,
} from '@/components/subcontract-quotes/decision-controls'
import { loadRequestFormOptions } from '@/lib/subcontract-quotes-data'
import { loadQualificationSummaries } from '@/lib/subcontractor-qualification-data'
import { qualificationBadge, vettingStatusOf } from '@/lib/subcontractor-qualification'
import { COST_CODE_GROUPS } from '@/lib/job-costing'
import {
  REVISION_COLUMNS,
  SELECTION_DISCLAIMER,
  formatDeadline,
  formatMoney,
  isoToZonedLocal,
  payableCents,
  responseState,
  type QuoteDecision,
  type QuoteRevision,
  type RequestStatus,
  type ScopeDocument,
} from '@/lib/subcontract-quotes'

export const metadata: Metadata = { title: 'Quote request' }

type Request = {
  id: string
  title: string
  trade: string | null
  status: RequestStatus
  currency: string | null
  response_deadline: string | null
  deadline_timezone: string | null
  draft_scope: string | null
  draft_document_ids: string[] | null
  current_scope_version: number
  cost_category: string | null
  schedule_activity_id: string | null
  work_window_start: string | null
  work_window_end: string | null
  row_version: number
}
type Invitation = {
  id: string
  subcontractor_company_id: string
  status: string
  decline_reason: string | null
  revision_requested_at: string | null
  revision_instructions: string | null
  decision: QuoteDecision | null
  decision_at: string | null
  decision_message: string | null
  company: { company_name: string; trade: string; status: string } | null
}
type Award = {
  id: string
  invitation_id: string
  revision_id: string
  scope_version: number
  currency: string
  amount_cents: number
  tax_treatment: string
  tax_amount_cents: number | null
  acknowledged_warnings: string[]
  decided_at: string
  commitment_id: string | null
}
type Note = { id: string; invitation_id: string | null; revision_id: string | null; body: string; created_at: string }
type ScopeVersion = { version: number; scope: string; documents: ScopeDocument[]; change_summary: string | null; published_at: string }
type Attachment = { id: string; revision_id: string; storage_path: string; file_name: string }
type Event = { id: string; event_type: string; message: string | null; created_at: string; invitation_id: string | null }

const EVENT_LABELS: Record<string, string> = {
  created: 'Draft created',
  sent: 'Request sent',
  invited: 'Company invited',
  scope_amended: 'Scope amended',
  deadline_changed: 'Deadline changed',
  closed: 'Responses closed',
  reopened: 'Responses reopened',
  cancelled: 'Request cancelled',
  submitted: 'Quote submitted',
  declined: 'Invitation declined',
  revision_requested: 'Revision requested',
  rejected: 'Quote rejected',
  selected: 'Quote selected',
  not_selected: 'Marked not selected',
  awarded: 'Request awarded',
  commitment_created: 'Draft commitment created',
}

const COMMITMENT_CATEGORIES = COST_CODE_GROUPS.filter((g) => g.categories.length).map((g) => ({
  label: `${g.code} ${g.label}`,
  options: [...g.categories] as string[],
}))

export default async function QuoteRequestPage({ params }: { params: Promise<{ id: string; requestId: string }> }) {
  const session = await requireManager()
  await requireFeature(session.organizationId, 'subcontractors')
  const { id, requestId } = await params
  if (!z.uuid().safeParse(requestId).success) notFound()
  const supabase = await createClient()

  const { data: req } = await supabase
    .from('subcontract_quote_requests')
    .select(
      'id, title, trade, status, currency, response_deadline, deadline_timezone, draft_scope, draft_document_ids, current_scope_version, cost_category, schedule_activity_id, work_window_start, work_window_end, row_version',
    )
    .eq('id', requestId)
    .eq('project_id', id)
    .eq('organization_id', session.organizationId)
    .maybeSingle()
  if (!req) notFound()
  const request = req as Request

  const [{ data: project }, options, inv, versions, revs, events] = await Promise.all([
    supabase.from('projects').select('name, currency').eq('id', id).maybeSingle(),
    loadRequestFormOptions(supabase, session.organizationId, id),
    supabase
      .from('subcontract_quote_invitations')
      .select(
        'id, subcontractor_company_id, status, decline_reason, revision_requested_at, revision_instructions, decision, decision_at, decision_message, company:subcontractor_companies(company_name, trade, status)',
      )
      .eq('request_id', requestId),
    supabase.from('subcontract_quote_scope_versions').select('version, scope, documents, change_summary, published_at').eq('request_id', requestId).order('version', { ascending: false }),
    supabase.from('subcontract_quote_revisions').select(REVISION_COLUMNS).eq('request_id', requestId).eq('status', 'submitted').order('revision_number', { ascending: false }),
    supabase.from('subcontract_quote_events').select('id, event_type, message, created_at, invitation_id').eq('request_id', requestId).order('created_at', { ascending: false }).limit(100),
  ])
  const projectName = (project as { name?: string } | null)?.name ?? 'Project'
  const projectCurrency = (project as { currency?: string | null } | null)?.currency ?? null
  const back = (
    <Link href={`/projects/${id}/subcontractor-work/quotes`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" aria-hidden="true" /> All quote requests
    </Link>
  )

  if (request.status === 'draft') {
    const tz = request.deadline_timezone ?? 'America/Chicago'
    return (
      <div className="flex w-full max-w-4xl flex-col gap-5">
        {back}
        <PageHeader icon={FileSpreadsheet} eyebrow={projectName} title={request.title} titleAddon={<RequestStatusBadge status="draft" />} description="Drafts are private to your team until sent." />
        <Surface>
          <RequestForm
            projectId={id}
            requestId={request.id}
            rowVersion={request.row_version}
            currency={projectCurrency}
            companies={options.companies}
            documents={options.documents}
            activities={options.activities}
            initial={{
              title: request.title,
              trade: request.trade ?? '',
              scope: request.draft_scope ?? '',
              document_ids: request.draft_document_ids ?? [],
              company_ids: ((inv.data ?? []) as unknown as Invitation[]).map((i) => i.subcontractor_company_id),
              deadline_local: isoToZonedLocal(request.response_deadline, tz),
              deadline_timezone: tz,
              cost_category: request.cost_category ?? '',
              schedule_activity_id: request.schedule_activity_id ?? '',
              work_window_start: request.work_window_start ?? '',
              work_window_end: request.work_window_end ?? '',
            }}
          />
        </Surface>
      </div>
    )
  }

  const invitations = (inv.data ?? []) as unknown as Invitation[]
  const scopeVersions = (versions.data ?? []) as unknown as ScopeVersion[]
  const revisions = (revs.data ?? []) as unknown as QuoteRevision[]
  const current = scopeVersions[0]
  const revisionIds = revisions.map((r) => r.id)
  const { data: att } = revisionIds.length
    ? await supabase.from('subcontract_quote_attachments').select('id, revision_id, storage_path, file_name').in('revision_id', revisionIds)
    : { data: [] }
  const attachments = (att ?? []) as Attachment[]
  const companyName = new Map(invitations.map((i) => [i.id, i.company?.company_name ?? 'Company']))
  const invitedIds = new Set(invitations.map((i) => i.subcontractor_company_id))

  const [awardRes, notesRes, draftsRes, qual] = await Promise.all([
    supabase
      .from('subcontract_quote_awards')
      .select('id, invitation_id, revision_id, scope_version, currency, amount_cents, tax_treatment, tax_amount_cents, acknowledged_warnings, decided_at, commitment_id')
      .eq('request_id', requestId)
      .maybeSingle(),
    supabase.from('subcontract_quote_review_notes').select('id, invitation_id, revision_id, body, created_at').eq('request_id', requestId).order('created_at', { ascending: false }).limit(200),
    supabase.rpc('quote_request_draft_flags', { p_request: requestId }),
    loadQualificationSummaries(supabase, session.organizationId, invitations.map((i) => i.subcontractor_company_id)),
  ])
  const decisionsReady = !awardRes.error && !notesRes.error
  const award = (awardRes.data ?? null) as Award | null
  const notes = (notesRes.data ?? []) as Note[]
  const draftInvitations = new Set(((draftsRes.data ?? []) as { invitation_id: string }[]).map((d) => d.invitation_id))
  const { data: commitment } = award?.commitment_id
    ? await supabase.from('project_commitments').select('status').eq('id', award.commitment_id).maybeSingle()
    : { data: null }
  const today = new Date().toISOString().slice(0, 10)
  const canDecide = decisionsReady && !award && (request.status === 'open' || request.status === 'closed')

  const entries = invitations.flatMap((i) => {
    const latest = revisions.find((r) => r.invitation_id === i.id)
    if (!latest || i.status === 'declined') return []
    const summary = qual.byCompany[i.subcontractor_company_id]
    const qualified = vettingStatusOf(summary) === 'qualified'
    const outdatedScope = latest.scope_version !== request.current_scope_version
    const revisionOutstanding = !!i.revision_requested_at && (!latest.submitted_at || i.revision_requested_at > latest.submitted_at)
    const expired = !!latest.valid_until && latest.valid_until < today
    const blockers = [
      outdatedScope && `Priced against scope v${latest.scope_version ?? '?'}; current is v${request.current_scope_version}. Request a revision first.`,
      revisionOutstanding && 'A revision request is still outstanding. Wait for the revised quote.',
      i.company?.status !== 'active' && 'This company is no longer active in your directory.',
      !qualified && qual.mode === 'enforcement' && 'This company is not qualified for new project work.',
    ].filter(Boolean) as string[]
    const compare: CompareEntry = {
      invitationId: i.id,
      company: i.company?.company_name ?? 'Company',
      qualification: qualificationBadge(summary ?? null).label,
      revision: latest,
      outdatedScope,
      expired,
      revisionOutstanding,
      draftOutstanding: draftInvitations.has(i.id),
      decision: i.decision,
    }
    const candidate: SelectCandidate = {
      revisionId: latest.id,
      company: compare.company,
      revisionNumber: latest.revision_number,
      scopeVersion: latest.scope_version,
      currentScope: request.current_scope_version,
      amountCents: latest.amount_cents,
      taxTreatment: latest.tax_treatment,
      taxAmountCents: latest.tax_amount_cents,
      payable: payableCents(latest),
      qualification: compare.qualification,
      qualificationWarning: !qualified,
      expired,
      validUntil: latest.valid_until ? formatDate(latest.valid_until) : null,
      blockers,
    }
    return [{ invitationId: i.id, compare, candidate }]
  })
  const candidateFor = new Map(entries.map((e) => [e.invitationId, e.candidate]))
  const awardedInvitation = award ? invitations.find((i) => i.id === award.invitation_id) : undefined
  const awardedRevision = award ? revisions.find((r) => r.id === award.revision_id) : undefined

  return (
    <div className="flex w-full max-w-5xl flex-col gap-5">
      {back}
      <PageHeader
        icon={FileSpreadsheet}
        eyebrow={projectName}
        title={request.title}
        titleAddon={<RequestStatusBadge status={request.status} />}
        description={[request.trade, `Responses due ${formatDeadline(request.response_deadline, request.deadline_timezone)}`, request.currency].filter(Boolean).join(' · ')}
      />

      <Surface aria-label="Request controls">
        <RequestControls
          projectId={id}
          requestId={request.id}
          status={request.status}
          rowVersion={request.row_version}
          timezone={request.deadline_timezone ?? 'America/Chicago'}
          scope={current?.scope ?? ''}
          documentIds={(current?.documents ?? []).map((d) => d.document_id)}
          documents={options.documents}
          uninvited={options.companies.filter((c) => !invitedIds.has(c.id))}
        />
      </Surface>

      {!decisionsReady ? (
        <Surface>
          <p className="text-sm text-muted-foreground">Quote decisions need the 20261201000010_subcontract_quote_decisions.sql migration before they can be used.</p>
        </Surface>
      ) : null}

      {award && awardedInvitation ? (
        <Surface aria-labelledby="award-heading">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="award-heading" className="font-serif text-lg font-semibold text-foreground">
              Selected quote
            </h2>
            <DecisionBadge decision="selected" />
          </div>
          <p className="text-sm text-muted-foreground">{SELECTION_DISCLAIMER}</p>
          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">Company</dt>
              <dd className="font-medium text-foreground">{awardedInvitation.company?.company_name}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Revision and scope</dt>
              <dd>
                Revision {awardedRevision?.revision_number ?? '?'} · scope v{award.scope_version}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Base amount</dt>
              <dd className="tabular-nums">{formatMoney(award.amount_cents, award.currency)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Selected</dt>
              <dd>{formatDateTime(award.decided_at)}</dd>
            </div>
          </dl>
          {award.acknowledged_warnings.length ? (
            <p className="text-xs text-warning">Selected with acknowledged warnings: {award.acknowledged_warnings.join(', ')}.</p>
          ) : null}
          <div className="border-t border-border pt-4">
            <CommitmentPanel
              projectId={id}
              requestId={request.id}
              commitmentId={award.commitment_id}
              commitmentStatus={(commitment as { status?: string } | null)?.status ?? null}
              company={awardedInvitation.company?.company_name ?? 'the company'}
              defaultDescription={[request.title, request.trade].filter(Boolean).join(' · ')}
              defaultAmountCents={award.amount_cents}
              defaultCategory={request.cost_category ?? ''}
              categories={COMMITMENT_CATEGORIES}
              currency={award.currency}
              projectCurrency={projectCurrency}
            />
          </div>
        </Surface>
      ) : null}

      {entries.length >= 2 ? (
        <Surface aria-labelledby="compare-heading">
          <h2 id="compare-heading" className="font-serif text-lg font-semibold text-foreground">
            Compare quotes
          </h2>
          <QuoteComparison entries={entries.map((e) => e.compare)} currency={request.currency} currentScope={request.current_scope_version} />
        </Surface>
      ) : null}

      <Surface aria-labelledby="responses-heading">
        <h2 id="responses-heading" className="font-serif text-lg font-semibold text-foreground">
          Responses
        </h2>
        <p className="text-sm text-muted-foreground">Amounts are shown as submitted. Alternates are never added to the base amount, and totals stay blank when tax is excluded but unknown.</p>
        <ul className="grid gap-4 lg:grid-cols-2">
          {invitations.map((i) => {
            const own = revisions.filter((r) => r.invitation_id === i.id)
            const latest = own[0]
            const state = responseState(i.status, i.revision_requested_at, latest?.submitted_at ?? null)
            return (
              <li key={i.id} className="flex flex-col gap-3 rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-foreground">{i.company?.company_name}</p>
                    <p className="text-xs text-muted-foreground">{i.company?.trade}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <ResponseBadge state={state} />
                    {i.decision ? <DecisionBadge decision={i.decision} /> : null}
                  </div>
                </div>
                {i.decision === 'rejected' && i.decision_message ? (
                  <p className="text-xs text-muted-foreground">Told the company: {i.decision_message}</p>
                ) : null}
                {draftInvitations.has(i.id) && !i.decision ? (
                  <p className="text-xs text-muted-foreground">The company is editing a newer draft. Drafts stay private until submitted.</p>
                ) : null}
                {i.status === 'declined' ? (
                  <p className="text-sm text-muted-foreground">{i.decline_reason || 'No reason given.'}</p>
                ) : latest ? (
                  <>
                    {latest.scope_version !== null && latest.scope_version < request.current_scope_version ? (
                      <p className="flex items-start gap-2 rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                        Priced against scope v{latest.scope_version}; current is v{request.current_scope_version}.
                      </p>
                    ) : null}
                    <QuoteDetails revision={latest} currency={request.currency} />
                    {attachments.filter((a) => a.revision_id === latest.id).map((a) => (
                      <FileLink key={a.id} kind="attachment" path={a.storage_path} label={a.file_name} />
                    ))}
                    {own.length > 1 ? (
                      <details className="text-sm">
                        <summary className="cursor-pointer text-muted-foreground">Earlier revisions ({own.length - 1})</summary>
                        <div className="mt-2 flex flex-col gap-3">
                          {own.slice(1).map((r) => (
                            <div key={r.id} className="rounded-md border border-dashed border-border p-3">
                              <QuoteDetails revision={r} currency={request.currency} />
                            </div>
                          ))}
                        </div>
                      </details>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      {request.status === 'open' && state === 'submitted' && !i.decision ? (
                        <RevisionRequestButton projectId={id} requestId={request.id} invitationId={i.id} />
                      ) : null}
                      {canDecide && !i.decision && candidateFor.get(i.id) ? (
                        <>
                          <SelectQuoteButton projectId={id} requestId={request.id} currency={request.currency} c={candidateFor.get(i.id)!} />
                          <RejectQuoteButton projectId={id} requestId={request.id} invitationId={i.id} company={i.company?.company_name ?? 'this company'} />
                        </>
                      ) : null}
                    </div>
                    {decisionsReady ? (
                      <div className="flex flex-col gap-2 border-t border-border pt-3">
                        {notes.filter((n) => n.invitation_id === i.id).length ? (
                          <ul className="flex flex-col gap-2">
                            {notes
                              .filter((n) => n.invitation_id === i.id)
                              .map((n) => (
                                <li key={n.id} className="rounded-md bg-muted/60 px-3 py-2 text-sm">
                                  <p className="whitespace-pre-wrap text-foreground">{n.body}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {formatDateTime(n.created_at)}
                                    {n.revision_id ? ` · revision ${revisions.find((r) => r.id === n.revision_id)?.revision_number ?? '?'}` : ''}
                                  </p>
                                </li>
                              ))}
                          </ul>
                        ) : null}
                        <ReviewNoteForm projectId={id} requestId={request.id} invitationId={i.id} revisionId={latest.id} />
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No quote submitted yet. Drafts stay private to the company.</p>
                )}
                {state === 'revision_requested' && i.revision_instructions ? (
                  <p className="text-xs text-muted-foreground">Requested: {i.revision_instructions}</p>
                ) : null}
              </li>
            )
          })}
        </ul>
      </Surface>

      <div className="grid gap-5 lg:grid-cols-2">
        <Surface aria-labelledby="scope-heading">
          <h2 id="scope-heading" className="font-serif text-lg font-semibold text-foreground">Scope versions</h2>
          <ol className="flex flex-col gap-4">
            {scopeVersions.map((v) => (
              <li key={v.version} className="flex flex-col gap-2">
                <p className="text-sm font-medium text-foreground">
                  Version {v.version} <span className="font-normal text-muted-foreground">· {formatDateTime(v.published_at)}</span>
                </p>
                {v.change_summary ? <p className="text-sm text-muted-foreground">{v.change_summary}</p> : null}
                <p className="whitespace-pre-wrap text-sm text-foreground">{v.scope}</p>
                {v.documents.length ? (
                  <ul className="flex flex-col text-xs text-muted-foreground">
                    {v.documents.map((d) => (
                      <li key={d.version_id}>{d.name} · v{d.version_number}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ol>
          {request.work_window_start || request.work_window_end ? (
            <p className="text-sm text-muted-foreground">Work window: {formatDate(request.work_window_start)} – {formatDate(request.work_window_end)}</p>
          ) : null}
        </Surface>

        <Surface aria-labelledby="history-heading">
          <h2 id="history-heading" className="font-serif text-lg font-semibold text-foreground">History</h2>
          <ol className="flex flex-col gap-3">
            {((events.data ?? []) as Event[]).map((e) => (
              <li key={e.id} className="flex flex-col text-sm">
                <span className="font-medium text-foreground">
                  {EVENT_LABELS[e.event_type] ?? e.event_type}
                  {e.invitation_id ? <span className="font-normal text-muted-foreground"> · {companyName.get(e.invitation_id)}</span> : null}
                </span>
                {e.message ? <span className="text-muted-foreground">{e.message}</span> : null}
                <span className="text-xs text-muted-foreground">{formatDateTime(e.created_at)}</span>
              </li>
            ))}
          </ol>
        </Surface>
      </div>
    </div>
  )
}
