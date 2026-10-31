import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FileDiff, FileText, Pencil } from 'lucide-react'
import { requireManager } from '@/lib/session'
import { getOrgFeatures, requireFeature } from '@/lib/features'
import { createClient } from '@/lib/supabase/server'
import { formatDate, formatDateTime } from '@/lib/format'
import { formatMoney } from '@/lib/financials'
import { getPeopleNames } from '@/lib/people'
import { loadChangeOrder } from '@/lib/change-orders-data'
import {
  CHANGE_ORDER_DECISION_METHODS,
  CHANGE_ORDER_STATUS_LABELS,
  changeOrderPath,
  changeOrdersPath,
  formatScheduleDays,
  isChangeOrderStatus,
  isEditableStatus,
} from '@/lib/change-orders'
import { PageHeader, SectionHeading, Surface } from '@/components/shared/page-header'
import { ChangeOrderStatusBadge } from '@/components/change-orders/change-order-status-badge'
import { ChangeOrderProgress } from '@/components/change-orders/change-order-progress'
import { ChangeOrderWorkflow } from '@/components/change-orders/change-order-workflow'
import { deleteDraftChangeOrderAction } from '@/app/actions/change-orders'
import { Button, buttonVariants } from '@/components/ui/button'

export const metadata: Metadata = { title: 'Change order' }

type Event = { id: string; version: number; from_status: string | null; to_status: string; note: string | null; actor: string | null; created_at: string }

export default async function ChangeOrderDetailPage({ params }: { params: Promise<{ id: string; coId: string }> }) {
  const session = await requireManager()
  await requireFeature(session.organizationId, 'change_orders')
  const { id, coId } = await params
  const data = await loadChangeOrder(id, coId)
  if (!data) notFound()
  const { co, lines } = data

  const supabase = await createClient()
  const features = await getOrgFeatures(session.organizationId)
  const [{ data: rawEvents }, { data: signatures }, { data: today }, { count: documentCount }] = await Promise.all([
    supabase
      .from('change_order_events')
      .select('id, version, from_status, to_status, note, actor, created_at')
      .eq('change_order_id', coId)
      .order('created_at', { ascending: false })
      .limit(50),
    co.status === 'awaiting_homeowner' || co.signature_request_id
      ? supabase.from('signature_requests').select('id, title').eq('project_id', id).eq('status', 'completed').order('completed_at', { ascending: false }).limit(50)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    supabase.rpc('org_today', { p_org: session.organizationId }),
    features.documents
      ? supabase
          .from('project_documents')
          .select('id', { count: 'exact', head: true })
          .eq('scope', 'project')
          .eq('project_id', id)
          .eq('category', 'change_orders')
          .is('archived_at', null)
      : Promise.resolve({ count: null }),
  ])
  const events = (rawEvents ?? []) as Event[]
  const people = await getPeopleNames(events.map((e) => e.actor))
  const todayIso = (today as string | null) ?? new Date().toISOString().slice(0, 10)
  const signatureOptions = (signatures ?? []) as { id: string; title: string }[]
  const linkedSignature = signatureOptions.find((s) => s.id === co.signature_request_id)
  const methodLabel = CHANGE_ORDER_DECISION_METHODS.find((m) => m.value === co.decision_method)?.label
  const submittedEvent = events.find((e) => e.to_status === 'internal_review')
  const sentEvent = events.find((e) => e.to_status === 'awaiting_homeowner')
  const decisionEvent = events.find((e) => e.to_status === 'approved' || e.to_status === 'rejected')
  const actorName = (e: Event | undefined) => (e?.actor ? people[e.actor] : undefined)
  const documentsHref = `/projects/${encodeURIComponent(id)}/documents?category=change_orders`

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${co.co_number} · ${co.title}`}
        description={`Version ${co.version} · Created ${formatDate(co.created_at)} · Updated ${formatDate(co.updated_at)}`}
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

      <Surface aria-label="Approval progress">
        <ChangeOrderProgress status={co.status} />
      </Surface>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <dl className="grid gap-3 sm:grid-cols-3">
            <Stat label="Homeowner price change" value={formatMoney(co.price_adjustment_cents, { signed: true })} detail="Shown to homeowner" emphasis />
            <Stat label="Builder cost change" value={formatMoney(co.cost_adjustment_cents, { signed: true })} detail="Internal only" />
            <Stat label="Schedule impact" value={formatScheduleDays(co.schedule_impact_days, 'long')} detail="Shown to homeowner" />
          </dl>

          <ChangeOrderWorkflow projectId={id} id={co.id} status={co.status} version={co.version} today={todayIso} signatureOptions={signatureOptions} />

          {(co.status === 'approved' || co.status === 'rejected') && (
            <Surface aria-labelledby="co-decision">
              <SectionHeading id="co-decision" title={co.status === 'approved' ? 'Approval' : 'Rejection'} />
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <Detail label="Homeowner decision by" value={co.decision_by_name} />
                <Detail label="Method" value={methodLabel} />
                <Detail label="Decision date" value={co.decision_at ? formatDate(co.decision_at) : null} />
                <Detail label="Recorded by" value={actorName(decisionEvent)} />
                <Detail label="Signed document" value={linkedSignature?.title ?? (co.signature_request_id ? 'Linked signature request' : 'None')} />
                <Detail label="Version decided" value={decisionEvent ? `v${decisionEvent.version}` : null} />
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
              <SectionHeading id="co-lines" title="Builder cost lines" description="Internal only. Negative amounts are credits." />
            </div>
            {lines.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-muted-foreground md:px-6">No cost lines.</p>
            ) : (
              <>
                <ul className="flex flex-col divide-y divide-border/60 border-t border-border/70 md:hidden">
                  {lines.map((l) => (
                    <li key={l.id} className="flex items-start justify-between gap-3 px-5 py-3 text-sm">
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-foreground">{l.description}</span>
                        <span className="text-xs text-muted-foreground">
                          {l.category} · {l.quantity} {l.unit} × {formatMoney(l.unit_cost_cents)}
                        </span>
                      </div>
                      <span className="shrink-0 font-medium tabular-nums">{formatMoney(l.cost_cents, { signed: true })}</span>
                    </li>
                  ))}
                  <li className="flex justify-between px-5 py-3 text-sm font-semibold">
                    <span>Total cost change</span>
                    <span className="tabular-nums">{formatMoney(co.cost_adjustment_cents, { signed: true })}</span>
                  </li>
                </ul>
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full text-sm">
                    <thead className="border-y border-border/70 text-left text-xs font-medium text-muted-foreground">
                      <tr>
                        <th scope="col" className="px-6 py-3">Category</th>
                        <th scope="col" className="px-3 py-3">Description</th>
                        <th scope="col" className="px-3 py-3 text-right">Qty</th>
                        <th scope="col" className="px-3 py-3 text-right">Unit cost</th>
                        <th scope="col" className="px-6 py-3 text-right">Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {lines.map((l) => (
                        <tr key={l.id}>
                          <td className="px-6 py-3 text-muted-foreground">{l.category}</td>
                          <td className="px-3 py-3">{l.description}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                            {l.quantity} {l.unit}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{formatMoney(l.unit_cost_cents)}</td>
                          <td className="whitespace-nowrap px-6 py-3 text-right font-medium tabular-nums">{formatMoney(l.cost_cents, { signed: true })}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t border-border/70">
                      <tr>
                        <th scope="row" colSpan={4} className="px-6 py-3 text-right font-medium">
                          Total cost change
                        </th>
                        <td className="px-6 py-3 text-right font-semibold tabular-nums">{formatMoney(co.cost_adjustment_cents, { signed: true })}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            )}
          </Surface>

          <Surface aria-labelledby="co-history">
            <SectionHeading id="co-history" title="Activity" description="Every status change is recorded with the version it applied to." />
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity recorded.</p>
            ) : (
              <ol className="flex flex-col gap-3 text-sm">
                {events.map((e) => (
                  <li key={e.id} className="flex flex-col gap-0.5 border-l-2 border-border pl-3">
                    <span className="font-medium text-foreground">
                      {e.from_status && isChangeOrderStatus(e.from_status) && e.from_status !== e.to_status
                        ? `${CHANGE_ORDER_STATUS_LABELS[e.from_status]} → `
                        : ''}
                      {isChangeOrderStatus(e.to_status) ? CHANGE_ORDER_STATUS_LABELS[e.to_status] : e.to_status}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      v{e.version} · {formatDateTime(e.created_at)}
                      {actorName(e) ? ` · ${actorName(e)}` : ''}
                    </span>
                    {e.note && <span className="text-muted-foreground">{e.note}</span>}
                  </li>
                ))}
              </ol>
            )}
          </Surface>
        </div>

        <aside className="flex flex-col gap-6 lg:sticky lg:top-6" aria-label="Change order summary">
          <Surface aria-labelledby="co-homeowner">
            <SectionHeading id="co-homeowner" title="Homeowner summary" description="What the homeowner is asked to approve. Builder cost is never included." />
            <dl className="flex flex-col gap-3 text-sm">
              <Detail label="Change" value={co.title} />
              <Detail label="Price change" value={formatMoney(co.price_adjustment_cents, { signed: true })} />
              <Detail label="Schedule impact" value={formatScheduleDays(co.schedule_impact_days, 'long')} />
              {co.description && <Detail label="Details" value={co.description} />}
            </dl>
          </Surface>

          <Surface aria-labelledby="co-tracking">
            <SectionHeading id="co-tracking" title="Tracking" />
            <dl className="flex flex-col gap-3 text-sm">
              <Detail label="Submitted for review" value={submittedEvent ? joinParts(formatDate(submittedEvent.created_at), actorName(submittedEvent)) : null} />
              <Detail
                label="Sent to homeowner"
                value={co.sent_to_homeowner_at ? joinParts(formatDate(co.sent_to_homeowner_at), actorName(sentEvent)) : null}
              />
              <Detail label="Current version" value={`v${co.version}`} />
            </dl>
          </Surface>

          {features.documents && (
            <Surface aria-labelledby="co-docs">
              <SectionHeading id="co-docs" title="Documents" />
              <p className="text-sm text-muted-foreground">
                {documentCount
                  ? `${documentCount} file${documentCount === 1 ? '' : 's'} in this project's Change Orders folder.`
                  : "No files in this project's Change Orders folder yet."}
              </p>
              <Link href={documentsHref} className={buttonVariants({ variant: 'outline', size: 'sm', className: 'self-start' })}>
                <FileText className="size-4" aria-hidden="true" />
                Open folder
              </Link>
            </Surface>
          )}

          {co.status === 'draft' && co.version === 1 && (
            <form action={deleteDraftChangeOrderAction} className="flex">
              <input type="hidden" name="project_id" value={id} />
              <input type="hidden" name="id" value={co.id} />
              <Button type="submit" variant="ghost" className="text-destructive">
                Delete draft
              </Button>
            </form>
          )}
        </aside>
      </div>
    </div>
  )
}

function joinParts(...parts: (string | undefined)[]) {
  return parts.filter(Boolean).join(' · ')
}

function Stat({ label, value, detail, emphasis }: { label: string; value: string; detail?: string; emphasis?: boolean }) {
  return (
    <div className="surface flex flex-col gap-1 p-4">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={emphasis ? 'text-xl font-semibold tabular-nums text-primary' : 'text-xl font-semibold tabular-nums text-foreground'}>{value}</dd>
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
