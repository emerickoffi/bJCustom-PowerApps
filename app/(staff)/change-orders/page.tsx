import type { Metadata } from 'next'
import { FileDiff } from 'lucide-react'
import { requireManager } from '@/lib/session'
import { requireFeature } from '@/lib/features'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/financials'
import { isChangeOrderStatus, summarizeChangeOrders } from '@/lib/change-orders'
import { EmptyState, PageHeader, Surface } from '@/components/shared/page-header'
import { OrgChangeOrderDirectory, type OrgChangeOrderRow } from '@/components/change-orders/org-change-order-directory'

export const metadata: Metadata = { title: 'Change orders' }

const ROW_LIMIT = 500

type RawRow = {
  id: string
  project_id: string
  number: number | string
  co_number: string
  title: string
  status: string
  price_adjustment_cents: number | string
  cost_adjustment_cents: number | string
  schedule_impact_days: number | null
  sent_to_homeowner_at: string | null
  decision_at: string | null
  updated_at: string
}

export default async function OrgChangeOrdersPage() {
  const session = await requireManager()
  await requireFeature(session.organizationId, 'change_orders')
  const supabase = await createClient()

  // RLS already limits rows to managers who can see each project's internal records; the org filter keeps workspaces isolated.
  const [{ data: rows, error }, { data: projects }] = await Promise.all([
    supabase
      .from('change_orders')
      .select(
        'id, project_id, number, co_number, title, status, price_adjustment_cents, cost_adjustment_cents, schedule_impact_days, sent_to_homeowner_at, decision_at, updated_at',
      )
      .eq('organization_id', session.organizationId)
      .order('updated_at', { ascending: false })
      .limit(ROW_LIMIT),
    supabase.from('projects').select('id, name, project_number').eq('organization_id', session.organizationId).order('name').limit(ROW_LIMIT),
  ])

  const projectById = new Map((projects ?? []).map((p) => [p.id as string, p as { id: string; name: string; project_number: string | null }]))

  const list: OrgChangeOrderRow[] = ((rows ?? []) as RawRow[]).flatMap((r) => {
    const project = projectById.get(r.project_id)
    if (!project || !isChangeOrderStatus(r.status)) return []
    return [
      {
        ...r,
        status: r.status,
        number: Number(r.number),
        price_adjustment_cents: Number(r.price_adjustment_cents),
        cost_adjustment_cents: Number(r.cost_adjustment_cents),
        project_name: project.name,
        project_number: project.project_number,
      },
    ]
  })
  const summary = summarizeChangeOrders(list)
  const projectOptions = [...new Map(list.map((r) => [r.project_id, { id: r.project_id, name: r.project_name, project_number: r.project_number }])).values()].sort(
    (a, b) => a.name.localeCompare(b.name),
  )
  const awaitingCount = list.filter((r) => r.status === 'awaiting_homeowner').length

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Change orders"
        description="Scope and price changes across every project you can access. Open a change order to work on it inside its project."
        icon={FileDiff}
      />

      {error ? (
        <Surface role="alert">
          <p className="text-sm text-destructive">Change orders could not be loaded. Try again shortly.</p>
        </Surface>
      ) : list.length === 0 ? (
        <EmptyState
          icon={FileDiff}
          title="No change orders yet"
          description="Change orders are created from a project's Change orders tab. They will appear here once a project has one."
        />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Approved price changes" value={formatMoney(summary.approvedPriceCents, { signed: true })} detail={`${summary.approvedCount} approved`} emphasis />
            <Stat
              label="Pending price changes"
              value={formatMoney(summary.pendingPriceCents, { signed: true })}
              detail={`${summary.pendingCount} in review or with homeowner`}
            />
            <Stat label="Awaiting homeowner" value={String(awaitingCount)} detail="Decision needed" />
            <Stat label="Projects" value={String(projectOptions.length)} detail="With change orders" />
          </dl>
          <OrgChangeOrderDirectory rows={list} projects={projectOptions} />
          {(rows?.length ?? 0) >= ROW_LIMIT && (
            <p className="text-xs text-muted-foreground">Showing the {ROW_LIMIT} most recently updated change orders. Open a project to see its full history.</p>
          )}
        </>
      )}
    </div>
  )
}

function Stat({ label, value, detail, emphasis }: { label: string; value: string; detail: string; emphasis?: boolean }) {
  return (
    <div className="surface flex min-w-0 flex-col gap-1 p-4">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={emphasis ? 'text-xl font-semibold tabular-nums text-primary' : 'text-xl font-semibold tabular-nums text-foreground'}>{value}</dd>
      <dd className="text-xs text-muted-foreground">{detail}</dd>
    </div>
  )
}
