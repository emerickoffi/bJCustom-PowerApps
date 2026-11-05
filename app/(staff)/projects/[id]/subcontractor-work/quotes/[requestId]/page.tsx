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
import { RequestStatusBadge, ResponseBadge } from '@/components/subcontract-quotes/status-badges'
import { FileLink } from '@/components/subcontract-quotes/file-link'
import { QuoteDetails } from '@/components/subcontract-quotes/quote-details'
import { loadRequestFormOptions } from '@/lib/subcontract-quotes-data'
import {
  REVISION_COLUMNS,
  formatDeadline,
  isoToZonedLocal,
  responseState,
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
  company: { company_name: string; trade: string } | null
}
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
}

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
      .select('id, subcontractor_company_id, status, decline_reason, revision_requested_at, revision_instructions, company:subcontractor_companies(company_name, trade)')
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
              company_ids: ((inv.data ?? []) as Invitation[]).map((i) => i.subcontractor_company_id),
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
                  <ResponseBadge state={state} />
                </div>
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
                    {request.status === 'open' && state === 'submitted' ? (
                      <RevisionRequestButton projectId={id} requestId={request.id} invitationId={i.id} />
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
