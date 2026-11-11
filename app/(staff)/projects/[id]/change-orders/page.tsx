import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { FileDiff } from 'lucide-react'
import { requireManager } from '@/lib/session'
import { requireFeature } from '@/lib/features'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/financials'
import { isChangeOrderStatus, summarizeChangeOrders, type DirectoryRow } from '@/lib/change-orders'
import { PageHeader, Surface } from '@/components/shared/page-header'
import { ChangeOrderDirectory } from '@/components/change-orders/change-order-directory'
import { NewChangeOrderDrawer } from '@/components/change-orders/new-change-order-drawer'

export const metadata: Metadata = { title: 'Change orders' }

type RawRow = Omit<DirectoryRow, 'status'> & { status: string }

export default async function ChangeOrdersPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireManager()
  await requireFeature(session.organizationId, 'change_orders')
  const { id } = await params
  const supabase = await createClient()

  const [{ data: project }, { data: rows, error }] = await Promise.all([
    supabase.from('projects').select('id, name').eq('id', id).maybeSingle(),
    supabase
      .from('change_orders')
      .select('id, number, co_number, title, status, cost_adjustment_cents, price_adjustment_cents, schedule_impact_days, updated_at')
      .eq('project_id', id)
      .order('number', { ascending: false }),
  ])
  if (!project) notFound()

  const list: DirectoryRow[] = ((rows ?? []) as RawRow[])
    .filter((r): r is DirectoryRow => isChangeOrderStatus(r.status))
    .map((r) => ({
      ...r,
      number: Number(r.number),
      price_adjustment_cents: Number(r.price_adjustment_cents),
      cost_adjustment_cents: Number(r.cost_adjustment_cents),
    }))
  const summary = summarizeChangeOrders(list)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Change orders"
        icon={FileDiff}
        actions={<NewChangeOrderDrawer projectId={id} projectName={project.name} />}
      />

      {error ? (
        <Surface role="alert">
          <p className="text-sm text-destructive">Change orders could not be loaded. Try again shortly.</p>
        </Surface>
      ) : list.length === 0 ? (
        <ChangeOrdersEmpty />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              label="Approved price changes"
              value={formatMoney(summary.approvedPriceCents, { signed: true })}
              detail={`${summary.approvedCount} approved`}
              emphasis
            />
            <Stat label="Approved builder cost" value={formatMoney(summary.approvedCostCents, { signed: true })} detail="Internal only" />
            <Stat
              label="Pending price changes"
              value={formatMoney(summary.pendingPriceCents, { signed: true })}
              detail={`${summary.pendingCount} in review or with homeowner`}
            />
            <Stat
              label="Approved schedule impact"
              value={summary.approvedWithScheduleCount === 0 ? '—' : `${summary.approvedScheduleDays > 0 ? '+' : ''}${summary.approvedScheduleDays} days`}
              detail={
                summary.approvedWithScheduleCount === 0
                  ? 'No approved schedule changes'
                  : `From ${summary.approvedWithScheduleCount} approved change order${summary.approvedWithScheduleCount === 1 ? '' : 's'}`
              }
            />
          </dl>

          <ChangeOrderDirectory projectId={id} projectName={project.name} rows={list} />
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

function ChangeOrdersEmpty() {
  return (
    <section aria-labelledby="co-empty-heading" className="flex items-start gap-3 rounded-xl border border-border/80 bg-card p-4 sm:items-center">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sage text-primary ring-1 ring-inset ring-primary/10" aria-hidden="true">
        <FileDiff className="size-5" />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 id="co-empty-heading" className="type-section-title text-foreground">
          No change orders yet
        </h2>
        <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
          Track changes to scope, price, and schedule. Only approved change orders update the project budget.
        </p>
      </div>
    </section>
  )
}
