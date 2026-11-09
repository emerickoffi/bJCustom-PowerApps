import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertTriangle, ChevronRight, Plus } from 'lucide-react'
import { requireManager } from '@/lib/session'
import { requireFeature } from '@/lib/features'
import { createClient } from '@/lib/supabase/server'
import { SubWorkShell } from '@/components/subcontractor-work/sub-work-shell'
import { NewQuoteRequestDrawer } from '@/components/subcontract-quotes/new-request-drawer'
import { CurrencyNotice } from '@/components/subcontract-quotes/currency-notice'
import { emptyRequestDraft, loadRequestFormOptions } from '@/lib/subcontract-quotes-data'
import { RequestStatusBadge } from '@/components/subcontract-quotes/status-badges'
import { QUOTES_SETUP_MESSAGE, formatDeadline, isQuoteSetupError, type RequestStatus } from '@/lib/subcontract-quotes'

export const metadata: Metadata = { title: 'Subcontract quotes' }

type Row = {
  id: string
  title: string
  trade: string | null
  status: RequestStatus
  response_deadline: string | null
  deadline_timezone: string | null
  current_scope_version: number
  invitations: { status: string }[]
  revisions: { invitation_id: string }[]
}

export default async function QuoteRequestsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireManager()
  await requireFeature(session.organizationId, 'subcontractors')
  const { id } = await params
  const supabase = await createClient()

  const [{ data: project }, { data: canViewInternal }] = await Promise.all([
    supabase.from('projects').select('id, name').eq('id', id).eq('organization_id', session.organizationId).maybeSingle(),
    supabase.rpc('can_view_project_internal', { p_project: id }),
  ])
  if (!project || !canViewInternal) notFound()

  const [{ data, error }, { data: currencyRow }, options] = await Promise.all([
    supabase
      .from('subcontract_quote_requests')
      .select(
        'id, title, trade, status, response_deadline, deadline_timezone, current_scope_version, invitations:subcontract_quote_invitations(status), revisions:subcontract_quote_revisions(invitation_id)',
      )
      .eq('project_id', id)
      .eq('organization_id', session.organizationId)
      .order('updated_at', { ascending: false })
      .limit(200),
    supabase.from('projects').select('currency').eq('id', id).eq('organization_id', session.organizationId).maybeSingle(),
    loadRequestFormOptions(supabase, session.organizationId, id),
  ])
  const setupMissing = isQuoteSetupError(error)
  const rows = (data ?? []) as unknown as Row[]
  const currency = (currencyRow as { currency?: string | null } | null)?.currency ?? null
  // Reaching this page already requires a manager with internal access and the subcontractors feature — the same
  // conditions set_project_currency enforces server-side through can_manage_quotes.
  const canConfirmCurrency = Boolean(canViewInternal)

  return (
    <SubWorkShell
      projectId={id}
      active="quotes"
      count={setupMissing || error ? undefined : { value: rows.length, noun: 'request' }}
      actions={
        setupMissing ? null : (
          <NewQuoteRequestDrawer
            key={id}
            projectId={id}
            projectName={project.name}
            currency={currency}
            initial={emptyRequestDraft()}
            companies={options.companies}
            documents={options.documents}
            activities={options.activities}
          />
        )
      }
    >
      {setupMissing ? (
        <p className="flex items-start gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          {QUOTES_SETUP_MESSAGE}
        </p>
      ) : error ? (
        <p role="alert" className="text-sm text-destructive">
          Quote requests could not be loaded. Refresh to try again.
        </p>
      ) : (
        <>
          {!currency ? <CurrencyNotice projectId={id} canConfirm={canConfirmCurrency} /> : null}
          <section aria-label="Quote requests">
            {rows.length ? (
              <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
                {rows.map((r) => {
                  const responded = new Set(r.revisions.map((v) => v.invitation_id)).size
                  const declined = r.invitations.filter((i) => i.status === 'declined').length
                  return (
                    <li key={r.id}>
                      <Link
                        href={`/projects/${id}/subcontractor-work/quotes/${r.id}`}
                        className="flex items-center gap-4 px-3 py-3 transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:px-4"
                      >
                        <span className="flex min-w-0 flex-1 flex-col gap-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-foreground">{r.title}</span>
                            <RequestStatusBadge status={r.status} />
                            {r.current_scope_version > 1 ? (
                              <span className="text-xs text-muted-foreground">Scope v{r.current_scope_version}</span>
                            ) : null}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {[r.trade, r.status === 'draft' ? null : formatDeadline(r.response_deadline, r.deadline_timezone)].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                        <span className="hidden text-right text-sm tabular-nums sm:flex sm:flex-col">
                          <span className="text-foreground">
                            {r.invitations.length
                              ? `${responded} of ${r.invitations.length} ${r.invitations.length === 1 ? 'invitee' : 'invitees'} quoted`
                              : 'No invitees yet'}
                          </span>
                          {declined ? <span className="text-xs text-muted-foreground">{declined} declined</span> : null}
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-0.5">
                  <p className="text-sm font-medium text-foreground">No quote requests yet</p>
                  <p className="text-sm text-muted-foreground">Invite qualified subcontractors to price a scope of work.</p>
                </div>
                <Link
                  href={`/projects/${id}/subcontractor-work/quotes/new`}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground hover:bg-muted sm:min-h-9"
                >
                  <Plus className="size-4" aria-hidden="true" />
                  Create quote request
                </Link>
              </div>
            )}
          </section>
        </>
      )}
    </SubWorkShell>
  )
}
