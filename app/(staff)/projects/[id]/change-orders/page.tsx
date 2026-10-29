import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FileDiff, Plus } from 'lucide-react'
import { requireManager } from '@/lib/session'
import { requireFeature } from '@/lib/features'
import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/format'
import { formatMoney } from '@/lib/financials'
import { changeOrderPath, changeOrdersPath, isChangeOrderStatus, type ChangeOrderStatus } from '@/lib/change-orders'
import { EmptyState, PageHeader, Surface } from '@/components/shared/page-header'
import { ChangeOrderStatusBadge } from '@/components/change-orders/change-order-status-badge'
import { buttonVariants } from '@/components/ui/button'

export const metadata: Metadata = { title: 'Change orders' }

type Row = {
  id: string
  co_number: string
  title: string
  status: string
  cost_adjustment_cents: number
  price_adjustment_cents: number
  schedule_impact_days: number | null
  updated_at: string
}

export default async function ChangeOrdersPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireManager()
  await requireFeature(session.organizationId, 'change_orders')
  const { id } = await params
  const supabase = await createClient()

  const [{ data: project }, { data: rows, error }] = await Promise.all([
    supabase.from('projects').select('id, name').eq('id', id).maybeSingle(),
    supabase
      .from('change_orders')
      .select('id, co_number, title, status, cost_adjustment_cents, price_adjustment_cents, schedule_impact_days, updated_at')
      .eq('project_id', id)
      .order('number', { ascending: false }),
  ])
  if (!project) notFound()

  const list = ((rows ?? []) as Row[]).filter((r) => isChangeOrderStatus(r.status))
  const approved = list.filter((r) => r.status === 'approved')
  const pending = list.filter((r) => r.status === 'internal_review' || r.status === 'awaiting_homeowner')
  const sum = (rs: Row[], k: 'cost_adjustment_cents' | 'price_adjustment_cents') => rs.reduce((t, r) => t + Number(r[k]), 0)
  const newHref = `${changeOrdersPath(id)}/new`

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Change orders"
        description={`Scope, cost and price changes for ${project.name}. Only approved change orders affect the budget.`}
        icon={FileDiff}
        actions={
          <Link href={newHref} className={buttonVariants()}>
            <Plus className="size-4" aria-hidden="true" />
            New change order
          </Link>
        }
      />

      {error ? (
        <Surface role="alert">
          <p className="text-sm text-destructive">Change orders could not be loaded. Try again shortly.</p>
        </Surface>
      ) : list.length === 0 ? (
        <EmptyState
          icon={FileDiff}
          title="No change orders yet"
          description="Create a draft when scope changes. Builder cost and homeowner price are tracked separately."
          action={
            <Link href={newHref} className={buttonVariants()}>
              New change order
            </Link>
          }
        />
      ) : (
        <>
          <dl className="grid gap-3 sm:grid-cols-3">
            <Stat label="Approved price changes" value={formatMoney(sum(approved, 'price_adjustment_cents'), { signed: true })} detail={`${approved.length} approved`} />
            <Stat label="Approved cost changes" value={formatMoney(sum(approved, 'cost_adjustment_cents'), { signed: true })} detail="Internal only" />
            <Stat label="Pending price changes" value={formatMoney(sum(pending, 'price_adjustment_cents'), { signed: true })} detail={`${pending.length} in review or with homeowner`} />
          </dl>

          <Surface className="p-0 md:p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[44rem] text-sm">
                <caption className="sr-only">Change orders for {project.name}</caption>
                <thead className="border-b border-border/70 text-left text-xs font-medium text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-5 py-3">Number</th>
                    <th scope="col" className="px-3 py-3">Title</th>
                    <th scope="col" className="px-3 py-3">Status</th>
                    <th scope="col" className="px-3 py-3 text-right">Price change</th>
                    <th scope="col" className="px-3 py-3 text-right">Cost change</th>
                    <th scope="col" className="px-3 py-3 text-right">Schedule</th>
                    <th scope="col" className="px-5 py-3 text-right">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {list.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/40">
                      <td className="px-5 py-3 font-medium tabular-nums">
                        <Link href={changeOrderPath(id, r.id)} className="text-primary underline-offset-4 hover:underline">
                          {r.co_number}
                        </Link>
                      </td>
                      <td className="max-w-xs truncate px-3 py-3">{r.title}</td>
                      <td className="px-3 py-3">
                        <ChangeOrderStatusBadge status={r.status as ChangeOrderStatus} />
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{formatMoney(Number(r.price_adjustment_cents), { signed: true })}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">{formatMoney(Number(r.cost_adjustment_cents), { signed: true })}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                        {r.schedule_impact_days === null ? '—' : `${r.schedule_impact_days > 0 ? '+' : ''}${r.schedule_impact_days}d`}
                      </td>
                      <td className="px-5 py-3 text-right text-muted-foreground">{formatDate(r.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Surface>
        </>
      )}
    </div>
  )
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="surface flex flex-col gap-1 p-4">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums text-foreground">{value}</dd>
      <dd className="text-xs text-muted-foreground">{detail}</dd>
    </div>
  )
}
