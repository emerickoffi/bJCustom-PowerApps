import type { Metadata } from 'next'
import Link from 'next/link'
import { AlertTriangle, ArrowRight, Calculator, FileText, Plus, SearchX } from 'lucide-react'
import { ConstructionTotalInfo, EstimatePdfAction } from '@/components/estimates/estimate-table-hints'
import { Button, buttonVariants } from '@/components/ui/button'
import { requireStaff, canManage } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { clientDisplayName, listEstimates } from '@/lib/estimate-queries'
import { ESTIMATE_STATUSES, ESTIMATE_STATUS_LABELS, type EstimateStatus } from '@/lib/estimates'
import { formatCents, formatDate } from '@/lib/format'
import { PageHeader, EmptyState } from '@/components/shared/page-header'
import { EstimateStatusBadge } from '@/components/estimates/estimate-status-badge'
import {
  EstimateTitleCell,
  EstimateTitleEditHint,
  EstimateTitleGridProvider,
} from '@/components/estimates/estimate-title-grid'
import { EstimatesToolbar } from '@/components/estimates/estimates-toolbar'
import { titleEditEligibility } from '@/lib/estimate-title'
import { cn } from '@/lib/utils'

const TITLE_LINK_CLASS =
  'line-clamp-2 break-words rounded-sm font-medium text-[#006B78] hover:text-[#005560] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#006B78]'

export const metadata: Metadata = { title: 'Estimates' }

function DemoBadge() {
  return (
    <span className="inline-flex items-center rounded-full border border-[#D8E0E8] bg-[#E9EDF2] px-1.5 py-px text-[11px] font-medium leading-4 text-[#526173]">
      Demo data
    </span>
  )
}

function RevisionLabel({ revision, count }: { revision: number; count: number }) {
  if (revision <= 1 && count <= 1) return null
  return <span className="whitespace-nowrap text-xs tabular-nums text-[#526173]">{`Rev ${revision}${count > 1 ? ` of ${count}` : ''}`}</span>
}

export default async function EstimatesPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; status?: string; q?: string }>
}) {
  const session = await requireStaff()
  const manager = canManage(session.role)
  const params = await searchParams
  const projectId = params.project && /^[0-9a-f-]{36}$/i.test(params.project) ? params.project : undefined
  const status = ESTIMATE_STATUSES.includes(params.status as EstimateStatus) ? params.status : undefined
  const query = (typeof params.q === 'string' ? params.q : '').trim().slice(0, 100)

  const supabase = await createClient()
  const [{ estimates: statusScoped, revisionCount, all, failed }, projectsRes] = await Promise.all([
    listEstimates(session.organizationId, { projectId, status }),
    supabase
      .from('projects')
      .select('id, name')
      .eq('organization_id', session.organizationId)
      .order('name'),
  ])
  const projects = projectsRes.data ?? []
  const projectName = projectId ? projects.find((p) => p.id === projectId)?.name : undefined
  const createHref = projectId ? `/estimates/new?project=${projectId}` : '/estimates/new'

  const needle = query.toLowerCase()
  const estimates = needle
    ? statusScoped.filter((e) =>
        [e.name, e.estimate_number, clientDisplayName(e.client), e.project?.name].some((v) =>
          v?.toLowerCase().includes(needle),
        ),
      )
    : statusScoped

  const listHref = (next: { status?: string; q?: string }) => {
    const qs = new URLSearchParams()
    if (projectId) qs.set('project', projectId)
    if (next.status) qs.set('status', next.status)
    if (next.q) qs.set('q', next.q)
    const s = qs.toString()
    return s ? `/estimates?${s}` : '/estimates'
  }
  const clearHref = listHref({})
  const listQuery = listHref({ status, q: query }).split('?')[1] ?? ''
  const detailHref = (estimateId: string) => (listQuery ? `/estimates/${estimateId}?from=${encodeURIComponent(listQuery)}` : `/estimates/${estimateId}`)

  // Summary scope is unchanged: project + status filter, independent of the text search.
  const approvedTotal = all
    .filter((e) => e.status === 'approved')
    .reduce((sum, e) => sum + e.construction_total_cents, 0)
  const openCount = statusScoped.filter((e) => e.status === 'draft' || e.status === 'internal_review').length
  const awaitingCount = statusScoped.filter((e) => e.status === 'submitted').length
  const awaitingActive = status === 'submitted'

  // listEstimates returns only the latest revision per family.
  const eligibility = new Map(
    estimates.map((e) => [e.id, titleEditEligibility({ canManage: manager, status: e.status, isLatest: true })]),
  )
  const editableCount = [...eligibility.values()].filter((x) => x.editable).length
  const titleProps = (e: (typeof estimates)[number]) => {
    const el = eligibility.get(e.id)
    return {
      estimateId: e.id,
      estimateNumber: e.estimate_number,
      name: e.name,
      updatedAt: e.updated_at,
      editable: !!el?.editable,
      lockedReason: manager && el && !el.editable ? el.reason : undefined,
    }
  }
  const filtered = !!status || !!query
  const unavailable = '—'

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="Estimates"
        count={failed ? undefined : { value: estimates.length, noun: 'estimate' }}
        titleAddon={
          projectName && (
            <span className="text-sm text-muted-foreground">
              {'Filtered to '}
              <span className="font-medium text-foreground">{projectName}</span>
            </span>
          )
        }
        actions={
          manager && (
            <Button render={<Link href={createHref} />} nativeButton={false}>
              <Plus data-icon="inline-start" />
              Create estimate
            </Button>
          )
        }
      />

      <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <div className="flex items-center gap-1.5" title="Draft or internal review">
          <dt className="text-muted-foreground">In progress:</dt>
          <dd className="font-semibold tabular-nums text-foreground">{failed ? unavailable : openCount}</dd>
        </div>
        <span aria-hidden="true" className="h-4 w-px bg-border" />
        <div className="flex items-center gap-1.5" title="Submitted, no decision yet">
          <dt className="text-muted-foreground">Awaiting homeowner:</dt>
          <dd className="font-semibold tabular-nums text-foreground">
            {failed ? (
              unavailable
            ) : (
              <Link
                href={listHref({ status: awaitingActive ? undefined : 'submitted', q: query })}
                aria-current={awaitingActive ? 'true' : undefined}
                aria-label={
                  awaitingActive
                    ? `${awaitingCount} awaiting homeowner, filter applied. Show all statuses`
                    : `${awaitingCount} awaiting homeowner. Show only submitted estimates`
                }
                className={cn(
                  'rounded-sm text-[#006B78] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#006B78]',
                  awaitingActive && 'underline',
                )}
              >
                {awaitingCount}
              </Link>
            )}
          </dd>
        </div>
        <span aria-hidden="true" className="h-4 w-px bg-border" />
        <div className="flex items-center gap-1.5" title="All approved versions">
          <dt className="text-muted-foreground">Approved construction value:</dt>
          <dd className="font-semibold tabular-nums text-foreground">{failed ? unavailable : formatCents(approvedTotal)}</dd>
        </div>
      </dl>

      <EstimateTitleGridProvider organizationId={session.organizationId} editableCount={editableCount}>
        <div className="flex flex-col gap-2">
          <EstimatesToolbar
            projectId={projectId}
            status={status}
            query={query}
            statuses={ESTIMATE_STATUSES.map((s) => ({ value: s, label: ESTIMATE_STATUS_LABELS[s] }))}
          />
          <EstimateTitleEditHint />
        </div>

        {failed ? (
          <EmptyState
            icon={AlertTriangle}
            title="Estimates couldn't be loaded"
            description="Something went wrong while loading this list. Refresh the page to try again."
            action={
              <Button variant="outline" render={<Link href={listHref({ status, q: query })} />} nativeButton={false}>
                Try again
              </Button>
            }
          />
        ) : estimates.length === 0 && filtered ? (
          <EmptyState
            icon={SearchX}
            title="No estimates match these filters"
            description={[
              query && `Nothing matches "${query}"`,
              status && `${query ? 'with' : 'No'} ${projectName ? `${projectName} ` : ''}estimates ${ESTIMATE_STATUS_LABELS[status as EstimateStatus].toLowerCase()}`,
            ]
              .filter(Boolean)
              .join(' ') + '.'}
            action={
              <Button variant="outline" render={<Link href={clearHref} />} nativeButton={false}>
                Clear filters
              </Button>
            }
          />
        ) : estimates.length === 0 ? (
          <EmptyState
            icon={Calculator}
            title={projectName ? `No estimates for ${projectName} yet` : 'No estimates yet'}
            description="Create an estimate for an existing project. Line items, markup and contingency are totaled on the server."
            action={
              manager && (
                <Button render={<Link href={createHref} />} nativeButton={false}>
                  <Plus data-icon="inline-start" />
                  Create estimate
                </Button>
              )
            }
          />
        ) : (
          <div className="surface overflow-hidden p-0 xl:overflow-visible">
            <div className="hidden overflow-x-auto md:block xl:overflow-visible">
              <table className="w-full min-w-[880px] table-fixed text-sm text-[#17212B]">
                <caption className="sr-only">Estimates</caption>
                <colgroup>
                  <col className="w-[30%]" />
                  <col className="w-[15%]" />
                  <col className="w-[20%]" />
                  <col className="w-32" />
                  <col className="w-36" />
                  <col className="w-28" />
                  <col className="w-[9.5rem]" />
                </colgroup>
                <thead className="border-b border-[#D6DDE5] bg-table-head text-left text-xs font-medium text-[#526173] xl:sticky xl:top-16 xl:z-10 [&_th]:bg-table-head [&_th:first-child]:rounded-tl-[inherit] [&_th:last-child]:rounded-tr-[inherit]">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 font-medium">Estimate</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Client</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Project</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
                    <th scope="col" className="whitespace-nowrap px-3 py-2.5 text-right font-medium">
                      <span className="inline-flex items-center justify-end gap-1">
                        Construction total
                        <ConstructionTotalInfo />
                      </span>
                    </th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Created</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E3E8EE] bg-white">
                  {estimates.map((e) => (
                    <tr
                      key={e.id}
                      className="align-top transition-colors hover:bg-[#E6F3F4] has-[:focus-visible]:bg-[#E6F3F4] has-[:focus-visible]:shadow-[inset_3px_0_0_#006B78]"
                    >
                      <td className="px-4 py-2.5">
                        <EstimateTitleCell
                          layout="table"
                          {...titleProps(e)}
                          linkClassName={TITLE_LINK_CLASS}
                          meta={
                            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                              <span className="whitespace-nowrap font-mono text-xs text-[#526173]">{e.estimate_number}</span>
                              <RevisionLabel revision={e.revision} count={revisionCount.get(e.family_id) ?? 1} />
                              {e.is_demo && <DemoBadge />}
                            </div>
                          }
                        />
                      </td>
                      <td className="px-3 py-2.5 text-[#526173]">
                        {e.client ? (
                          <Link
                            href={`/clients/${e.client.id}`}
                            className="line-clamp-2 break-words rounded-sm hover:text-[#006B78] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#006B78]"
                          >
                            {clientDisplayName(e.client) ?? '—'}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {e.project ? (
                          <Link
                            href={`/projects/${e.project.id}`}
                            title={e.project.name}
                            className="line-clamp-2 break-words rounded-sm hover:text-[#006B78] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#006B78]"
                          >
                            {e.project.name}
                          </Link>
                        ) : (
                          <span className="text-[#526173]">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <EstimateStatusBadge status={e.status} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums text-[#17212B]">
                        {formatCents(e.construction_total_cents)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-[#526173]">{formatDate(e.created_at)}</td>
                      <td className="px-4 py-1.5">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            href={detailHref(e.id)}
                            className={buttonVariants({ variant: 'view', size: 'sm', className: 'h-9' })}
                          >
                            View
                            <span className="sr-only">{` ${e.estimate_number}`}</span>
                            <ArrowRight className="size-3.5" aria-hidden="true" />
                          </Link>
                          <EstimatePdfAction estimateId={e.id} estimateNumber={e.estimate_number} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="divide-y divide-[#E3E8EE] bg-white md:hidden">
              {estimates.map((e) => (
                <li key={e.id} className="flex flex-col gap-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <EstimateTitleCell
                        layout="card"
                        {...titleProps(e)}
                        linkClassName="break-words rounded-sm font-medium text-[#006B78] hover:text-[#005560] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#006B78]"
                        meta={
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono text-xs text-[#526173]">
                              {`${e.estimate_number} · Rev ${e.revision}`}
                              {(revisionCount.get(e.family_id) ?? 1) > 1 && ` of ${revisionCount.get(e.family_id)}`}
                            </span>
                            {e.is_demo && <DemoBadge />}
                          </div>
                        }
                      />
                    </div>
                    <div className="flex shrink-0 flex-col items-end">
                      <span className="font-semibold tabular-nums text-[#17212B]">{formatCents(e.construction_total_cents)}</span>
                      <span className="text-xs text-[#526173]">Construction total</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#526173]">
                    <EstimateStatusBadge status={e.status} />
                    <span className="min-w-0 break-words">{e.project?.name ?? '—'}</span>
                    <span aria-hidden="true">{'·'}</span>
                    <span className="min-w-0 break-words">{clientDisplayName(e.client) ?? 'No client'}</span>
                    <span aria-hidden="true">{'·'}</span>
                    <span className="whitespace-nowrap">{formatDate(e.created_at)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="view"
                      className="h-11"
                      render={<Link href={detailHref(e.id)} />} nativeButton={false}>
                      View
                      <span className="sr-only">{` ${e.estimate_number}`}</span>
                    </Button>
                    <Button
                      variant="ghost"
                      className="h-11 text-[#526173] hover:text-primary"
                      render={<Link href={`/print/estimates/${e.id}`} target="_blank" />}
                      nativeButton={false}
                    >
                      <FileText data-icon="inline-start" />
                      PDF
                      <span className="sr-only">{` for ${e.estimate_number}`}</span>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </EstimateTitleGridProvider>
    </div>
  )
}
