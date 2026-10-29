import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FileDiff, Pencil } from 'lucide-react'
import { requireManager } from '@/lib/session'
import { requireFeature } from '@/lib/features'
import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/format'
import { formatMoney } from '@/lib/financials'
import { loadChangeOrder } from '@/lib/change-orders-data'
import {
  CHANGE_ORDER_DECISION_METHODS,
  CHANGE_ORDER_STATUS_LABELS,
  changeOrderPath,
  changeOrdersPath,
  isChangeOrderStatus,
  isEditableStatus,
} from '@/lib/change-orders'
import { PageHeader, SectionHeading, Surface } from '@/components/shared/page-header'
import { ChangeOrderStatusBadge } from '@/components/change-orders/change-order-status-badge'
import { ChangeOrderWorkflow } from '@/components/change-orders/change-order-workflow'
import { deleteDraftChangeOrderAction } from '@/app/actions/change-orders'
import { Button, buttonVariants } from '@/components/ui/button'

export const metadata: Metadata = { title: 'Change order' }

type Event = { id: string; version: number; from_status: string | null; to_status: string; note: string | null; created_at: string }

export default async function ChangeOrderDetailPage({ params }: { params: Promise<{ id: string; coId: string }> }) {
  const session = await requireManager()
  await requireFeature(session.organizationId, 'change_orders')
  const { id, coId } = await params
  const data = await loadChangeOrder(id, coId)
  if (!data) notFound()
  const { co, lines } = data

  const supabase = await createClient()
  const [{ data: events }, { data: signatures }, { data: today }] = await Promise.all([
    supabase
      .from('change_order_events')
      .select('id, version, from_status, to_status, note, created_at')
      .eq('change_order_id', coId)
      .order('created_at', { ascending: false })
      .limit(50),
    co.status === 'awaiting_homeowner' || co.signature_request_id
      ? supabase.from('signature_requests').select('id, title').eq('project_id', id).eq('status', 'completed').order('completed_at', { ascending: false }).limit(50)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    supabase.rpc('org_today', { p_org: session.organizationId }),
  ])
  const todayIso = (today as string | null) ?? new Date().toISOString().slice(0, 10)
  const signatureOptions = (signatures ?? []) as { id: string; title: string }[]
  const linkedSignature = signatureOptions.find((s) => s.id === co.signature_request_id)
  const methodLabel = CHANGE_ORDER_DECISION_METHODS.find((m) => m.value === co.decision_method)?.label

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${co.co_number} · ${co.title}`}
        description={`Version ${co.version} · Created ${formatDate(co.created_at)}`}
        icon={FileDiff}
        backHref={changeOrdersPath(id)}
        backLabel="Change orders"
        actions={
          <div className="flex items-center gap-2">
            <ChangeOrderStatusBadge status={co.status} />
            {isEditableStatus(co.status) && (
              <Link href={`${changeOrderPath(id, co.id)}/edit`} className={buttonVariants({ variant: 'outline' })}>
                <Pencil className="size-4" aria-hidden="true" />
                Edit
              </Link>
            )}
          </div>
        }
      />

      <dl className="grid gap-3 sm:grid-cols-3">
        <Stat label="Homeowner price change" value={formatMoney(co.price_adjustment_cents, { signed: true })} />
        <Stat label="Builder cost change" value={formatMoney(co.cost_adjustment_cents, { signed: true })} detail="Internal only" />
        <Stat
          label="Schedule impact"
          value={co.schedule_impact_days === null ? 'Not set' : `${co.schedule_impact_days > 0 ? '+' : ''}${co.schedule_impact_days} days`}
        />
      </dl>

      <ChangeOrderWorkflow projectId={id} id={co.id} status={co.status} version={co.version} today={todayIso} signatureOptions={signatureOptions} />

      {(co.status === 'approved' || co.status === 'rejected') && (
        <Surface aria-labelledby="co-decision">
          <SectionHeading id="co-decision" title={co.status === 'approved' ? 'Approval' : 'Rejection'} />
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <Detail label="Decided by" value={co.decision_by_name} />
            <Detail label="Method" value={methodLabel} />
            <Detail label="Date" value={co.decision_at ? formatDate(co.decision_at) : null} />
            <Detail label="Signed document" value={linkedSignature?.title ?? (co.signature_request_id ? 'Linked signature request' : 'None')} />
            {co.decision_note && <Detail label="Note" value={co.decision_note} className="sm:col-span-2" />}
          </dl>
        </Surface>
      )}
      {co.status === 'void' && (
        <Surface aria-labelledby="co-void">
          <SectionHeading id="co-void" title="Voided" description={co.voided_at ? formatDate(co.voided_at) : undefined} />
          <p className="text-sm text-foreground">{co.void_reason}</p>
        </Surface>
      )}

      <Surface aria-labelledby="co-scope">
        <SectionHeading id="co-scope" title="Scope" />
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <Detail label="Description" value={co.description} className="sm:col-span-2" />
          <Detail label="Reason" value={co.reason} />
          <Detail label="Requested by" value={co.requested_by} />
        </dl>
      </Surface>

      <Surface aria-labelledby="co-lines" className="p-0 md:p-0">
        <div className="px-5 pt-5 md:px-6 md:pt-6">
          <SectionHeading id="co-lines" title="Cost lines" description="Internal builder cost. Negative amounts are credits." />
        </div>
        {lines.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted-foreground md:px-6">No cost lines.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="border-y border-border/70 text-left text-xs font-medium text-muted-foreground">
                <tr>
                  <th scope="col" className="px-5 py-3 md:px-6">Category</th>
                  <th scope="col" className="px-3 py-3">Description</th>
                  <th scope="col" className="px-3 py-3 text-right">Qty</th>
                  <th scope="col" className="px-3 py-3 text-right">Unit cost</th>
                  <th scope="col" className="px-5 py-3 text-right md:px-6">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {lines.map((l) => (
                  <tr key={l.id}>
                    <td className="px-5 py-3 text-muted-foreground md:px-6">{l.category}</td>
                    <td className="px-3 py-3">{l.description}</td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {l.quantity} {l.unit}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatMoney(l.unit_cost_cents)}</td>
                    <td className="px-5 py-3 text-right font-medium tabular-nums md:px-6">{formatMoney(l.cost_cents, { signed: true })}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-border/70">
                <tr>
                  <th scope="row" colSpan={4} className="px-5 py-3 text-right font-medium md:px-6">
                    Total cost change
                  </th>
                  <td className="px-5 py-3 text-right font-semibold tabular-nums md:px-6">{formatMoney(co.cost_adjustment_cents, { signed: true })}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Surface>

      <Surface aria-labelledby="co-history">
        <SectionHeading id="co-history" title="History" />
        <ol className="flex flex-col gap-3 text-sm">
          {((events ?? []) as Event[]).map((e) => (
            <li key={e.id} className="flex flex-col gap-0.5 border-l-2 border-border pl-3">
              <span className="font-medium text-foreground">
                {isChangeOrderStatus(e.to_status) ? CHANGE_ORDER_STATUS_LABELS[e.to_status] : e.to_status}
                <span className="font-normal text-muted-foreground"> · v{e.version} · {formatDate(e.created_at)}</span>
              </span>
              {e.note && <span className="text-muted-foreground">{e.note}</span>}
            </li>
          ))}
        </ol>
      </Surface>

      {co.status === 'draft' && co.version === 1 && (
        <form action={deleteDraftChangeOrderAction} className="flex justify-end">
          <input type="hidden" name="project_id" value={id} />
          <input type="hidden" name="id" value={co.id} />
          <Button type="submit" variant="ghost" className="text-destructive">
            Delete draft
          </Button>
        </form>
      )}
    </div>
  )
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="surface flex flex-col gap-1 p-4">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums text-foreground">{value}</dd>
      {detail && <dd className="text-xs text-muted-foreground">{detail}</dd>}
    </div>
  )
}

function Detail({ label, value, className }: { label: string; value: string | null | undefined; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap text-foreground">{value || '—'}</dd>
    </div>
  )
}
