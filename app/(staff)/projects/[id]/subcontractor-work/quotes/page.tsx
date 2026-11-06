import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertTriangle, ChevronRight, Coins, FileSpreadsheet } from 'lucide-react'
import { requireManager } from '@/lib/session'
import { requireFeature } from '@/lib/features'
import { createClient } from '@/lib/supabase/server'
import { PageHeader, Surface } from '@/components/shared/page-header'
import { SubcontractsNav } from '@/components/subcontract-quotes/subcontracts-nav'
import { SubWorkProjectSwitcher } from '@/components/subcontract-quotes/sub-work-project-switcher'
import { loadSubWorkProjectOptions } from '@/lib/subcontract-project-options'
import { NewQuoteRequestDrawer } from '@/components/subcontract-quotes/new-request-drawer'
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

  const [{ data, error }, { data: currencyRow }, options, projectOptions] = await Promise.all([
    supabase
      .from('subcontract_quote_requests')
      .select(
        'id, title, trade, status, response_deadline, deadline_timezone, current_scope_version, invitations:subcontract_quote_invitations(status), revisions:subcontract_quote_revisions(invitation_id)',
      )
      .eq('project_id', id)
      .eq('organization_id', session.organizationId)
      .order('updated_at', { ascending: false })
      .limit(200),
    supabase.from('projects').select('currency').eq('id', id).maybeSingle(),
    loadRequestFormOptions(supabase, session.organizationId, id),
    loadSubWorkProjectOptions(supabase, session.organizationId, { id: project.id, name: project.name }),
  ])
  const setupMissing = isQuoteSetupError(error)
  const rows = (data ?? []) as unknown as Row[]
  const currency = (currencyRow as { currency?: string | null } | null)?.currency ?? null

  return (
    <div className="flex w-full max-w-5xl flex-col gap-5">
      <PageHeader
        icon={FileSpreadsheet}
        title="Subcontract quotes"
        description={`Request, compare, and track subcontractor pricing for ${project.name}.`}
        actions={
          <>
            <SubWorkProjectSwitcher projects={projectOptions} currentId={project.id} tab="quotes" />
            {setupMissing ? null : (
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
            )}
          </>
        }
      />
      <SubcontractsNav projectId={id} active="quotes" />

      {setupMissing ? (
        <p className="flex items-start gap-2 rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          {QUOTES_SETUP_MESSAGE}
        </p>
      ) : error ? (
        <p role="alert" className="text-sm text-destructive">Quote requests could not be loaded. Refresh to try again.</p>
      ) : (
        <>
          {!currency ? (
            <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-muted-foreground">
              <Coins className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
              <span>
                <span className="font-medium text-foreground">Project currency not confirmed.</span> Requests can be saved as drafts, but
                can&apos;t be sent until you confirm it in New quote request.
              </span>
            </p>
          ) : null}
          <Surface aria-labelledby="quote-requests-heading">
            <h2 id="quote-requests-heading" className="font-serif text-lg font-semibold text-foreground">
              Requests <span className="font-sans text-sm font-normal text-muted-foreground">({rows.length})</span>
            </h2>
            {rows.length ? (
              <ul className="flex flex-col divide-y divide-border">
                {rows.map((r) => {
                  const responded = new Set(r.revisions.map((v) => v.invitation_id)).size
                  const declined = r.invitations.filter((i) => i.status === 'declined').length
                  return (
                    <li key={r.id}>
                      <Link
                        href={`/projects/${id}/subcontractor-work/quotes/${r.id}`}
                        className="flex items-center gap-4 rounded-md px-2 py-3 transition-colors hover:bg-muted/60"
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
                            {responded}/{r.invitations.length} quoted
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
              <p className="text-sm text-muted-foreground">No quote requests yet. Create one to invite qualified subcontractors to price a scope of work.</p>
            )}
          </Surface>
        </>
      )}
    </div>
  )
}
