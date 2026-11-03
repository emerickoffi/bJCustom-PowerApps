import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Calculator, CircleCheckBig, Clock, FileText, LoaderCircle, Plus, Calculator as CalculatorIcon } from 'lucide-react'
import { ConstructionTotalInfo, EstimatePdfAction } from '@/components/estimates/estimate-table-hints'
import { Button } from '@/components/ui/button'
import { requireStaff, canManage } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { clientDisplayName, listEstimates } from '@/lib/estimate-queries'
import { ESTIMATE_STATUSES, ESTIMATE_STATUS_LABELS, type EstimateStatus } from '@/lib/estimates'
import { formatCents, formatDate } from '@/lib/format'
import { PageHeader, EmptyState } from '@/components/shared/page-header'
import { NativeSelect } from '@/components/shared/form-field'
import { EstimateStatusBadge } from '@/components/estimates/estimate-status-badge'

export const metadata: Metadata = { title: 'Estimates' }

function DemoBadge() {
  return (
    <span className="inline-flex items-center rounded-full border border-[#D8E0E8] bg-[#E9EDF2] px-1.5 py-px text-[11px] font-medium leading-4 text-[#526173]">
      Demo data
    </span>
  )
}

export default async function EstimatesPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; status?: string }>
}) {
  const session = await requireStaff()
  const manager = canManage(session.role)
  const params = await searchParams
  const projectId = params.project && /^[0-9a-f-]{36}$/i.test(params.project) ? params.project : undefined
  const status = ESTIMATE_STATUSES.includes(params.status as EstimateStatus) ? params.status : undefined

  const supabase = await createClient()
  const [{ estimates, revisionCount, all }, projectsRes] = await Promise.all([
    listEstimates(session.organizationId, { projectId, status }),
    supabase
      .from('projects')
      .select('id, name')
      .eq('organization_id', session.organizationId)
      .order('name'),
  ])
  const projects = projectsRes.data ?? []

  const approvedTotal = all
    .filter((e) => e.status === 'approved')
    .reduce((sum, e) => sum + e.construction_total_cents, 0)
  const openCount = estimates.filter((e) => e.status === 'draft' || e.status === 'internal_review').length
  const awaitingCount = estimates.filter((e) => e.status === 'submitted').length

  return (
    <div className="flex flex-col gap-8">
      <PageHeader icon={CalculatorIcon}
        eyebrow="Preconstruction"
        title="Estimates"
        description="Builder-entered construction estimates for existing projects, with revisions and recorded homeowner approvals."
        actions={
          manager && (
            <Button
              size="lg"
              render={<Link href={projectId ? `/estimates/new?project=${projectId}` : '/estimates/new'} />}
              nativeButton={false}
            >
              <Plus data-icon="inline-start" />
              Create estimate
            </Button>
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        {[
          { label: 'In progress', value: String(openCount), hint: 'Draft or internal review', wide: false, icon: LoaderCircle, tone: 'bg-[#E6F0FF] text-[#1D5FBD]' },
          { label: 'Awaiting homeowner', value: String(awaitingCount), hint: 'Submitted, no decision yet', wide: false, icon: Clock, tone: 'bg-[#FFF2DA] text-[#96570E]' },
          { label: 'Approved construction value', value: formatCents(approvedTotal), hint: 'All approved versions', wide: true, icon: CircleCheckBig, tone: 'bg-[#E2F3E9] text-[#187542]' },
        ].map((s) => (
          <div key={s.label} className={`surface flex min-w-0 flex-col gap-1 p-4 sm:p-5 ${s.wide ? 'col-span-2 sm:col-span-1' : ''}`}>
            <span className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground">
              <span className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${s.tone}`}>
                <s.icon className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0">{s.label}</span>
            </span>
            <span className="break-words font-serif text-xl font-semibold tabular-nums text-foreground sm:text-2xl">{s.value}</span>
            <span className="hidden text-xs text-muted-foreground sm:block">{s.hint}</span>
          </div>
        ))}
      </div>

      <form method="get" className="grid grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Project</span>
          <NativeSelect name="project" defaultValue={projectId ?? ''} className="w-full bg-card sm:w-auto sm:min-w-56">
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</span>
          <NativeSelect name="status" defaultValue={status ?? ''} className="w-full bg-card sm:w-auto sm:min-w-48">
            <option value="">All statuses</option>
            {ESTIMATE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ESTIMATE_STATUS_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
        </label>
        <Button type="submit" variant="outline" size="lg">
          Apply
        </Button>
        {(projectId || status) && (
          <Button variant="ghost" size="lg" render={<Link href="/estimates" />} nativeButton={false}>
            Clear
          </Button>
        )}
      </form>

      {estimates.length === 0 ? (
        <EmptyState
          icon={Calculator}
          title={projectId || status ? 'No estimates match these filters' : 'No estimates yet'}
          description="Create an estimate for an existing project. Line items, markup and contingency are totaled on the server."
          action={
            manager && (
              <Button render={<Link href="/estimates/new" />} nativeButton={false}>
                <Plus data-icon="inline-start" />
                Create estimate
              </Button>
            )
          }
        />
      ) : (
        <div className="surface overflow-hidden p-0">
          <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[960px] text-sm text-[#17212B]">
            <caption className="sr-only">Estimates</caption>
            <thead className="border-b border-[#D6DDE5] bg-[#E9EDF2] text-left text-xs font-medium text-[#526173]">
              <tr>
                <th scope="col" className="min-w-60 px-5 py-3 font-medium">Estimate</th>
                <th scope="col" className="px-3 py-3 font-medium">Client</th>
                <th scope="col" className="min-w-40 px-3 py-3 font-medium">Project</th>
                <th scope="col" className="px-3 py-3 font-medium">Status</th>
                <th scope="col" className="px-3 py-3 font-medium">Revision</th>
                <th scope="col" className="whitespace-nowrap px-3 py-3 text-right font-medium">
                  <span className="inline-flex items-center justify-end gap-1">
                    Construction total
                    <ConstructionTotalInfo />
                  </span>
                </th>
                <th scope="col" className="px-3 py-3 font-medium">Created</th>
                <th scope="col" className="px-5 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E3E8EE] bg-white">
              {estimates.map((e) => (
                <tr key={e.id} className="align-top transition-colors hover:bg-[#F7F9FB]">
                  <td className="px-5 py-3">
                    <div className="flex min-w-0 flex-col gap-1">
                      <Link
                        href={`/estimates/${e.id}`}
                        title={e.name}
                        className="line-clamp-2 break-words rounded-sm font-medium text-[#17212B] hover:text-[#1D4ED8] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]"
                      >
                        {e.name}
                      </Link>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="whitespace-nowrap font-mono text-xs text-[#526173]">{e.estimate_number}</span>
                        {e.is_demo && <DemoBadge />}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-[#526173]">
                    {e.client ? (
                      <Link
                        href={`/clients/${e.client.id}`}
                        className="break-words rounded-sm hover:text-[#1D4ED8] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]"
                      >
                        {clientDisplayName(e.client) ?? '—'}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {e.project ? (
                      <Link
                        href={`/projects/${e.project.id}`}
                        title={e.project.name}
                        className="line-clamp-2 break-words rounded-sm hover:text-[#1D4ED8] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]"
                      >
                        {e.project.name}
                      </Link>
                    ) : (
                      <span className="text-[#526173]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <EstimateStatusBadge status={e.status} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 tabular-nums text-[#526173]">
                    {`Rev ${e.revision}`}
                    {(revisionCount.get(e.family_id) ?? 1) > 1 && (
                      <span className="text-xs">{` of ${revisionCount.get(e.family_id)}`}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums">
                    {formatCents(e.construction_total_cents)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 tabular-nums text-[#526173]">{formatDate(e.created_at)}</td>
                  <td className="px-5 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/estimates/${e.id}`}
                        className="inline-flex h-9 items-center gap-1 rounded-md px-2.5 text-sm font-medium text-[#1D4ED8] transition-colors hover:bg-[#EFF6FF] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#1D4ED8]"
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
                  <div className="flex min-w-0 flex-col gap-1">
                    <Link href={`/estimates/${e.id}`} className="break-words font-medium text-[#17212B] hover:text-[#1D4ED8]">
                      {e.name}
                    </Link>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-xs text-[#526173]">
                        {`${e.estimate_number} · Rev ${e.revision}`}
                        {(revisionCount.get(e.family_id) ?? 1) > 1 && ` of ${revisionCount.get(e.family_id)}`}
                      </span>
                      {e.is_demo && <DemoBadge />}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end">
                    <span className="font-medium tabular-nums text-[#17212B]">{formatCents(e.construction_total_cents)}</span>
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
                  <Button variant="outline" className="h-11" render={<Link href={`/estimates/${e.id}`} />} nativeButton={false}>
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
    </div>
  )
}
