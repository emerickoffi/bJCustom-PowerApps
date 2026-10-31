import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FileDiff, FileText, Pencil, Plus } from 'lucide-react'
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
import { ChangeOrderStepper } from '@/components/change-orders/change-order-stepper'
import { ChangeOrderSection } from '@/components/change-orders/change-order-section'
import { ChangeOrderWorkflow } from '@/components/change-orders/change-order-workflow'
import { deleteDraftChangeOrderAction } from '@/app/actions/change-orders'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

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
  const [{ data: project }, { data: rawEvents }, { data: signatures }, { data: today }, { count: documentCount }] = await Promise.all([
    supabase.from('projects').select('name').eq('id', id).maybeSingle(),
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
  const people = await getPeopleNames([...events.map((e) => e.actor), co.created_by])
  const todayIso = (today as string | null) ?? new Date().toISOString().slice(0, 10)
  const signatureOptions = (signatures ?? []) as { id: string; title: string }[]
  const linkedSignature = signatureOptions.find((s) => s.id === co.signature_request_id)
  const methodLabel = CHANGE_ORDER_DECISION_METHODS.find((m) => m.value === co.decision_method)?.label
  const submittedEvent = events.find((e) => e.to_status === 'internal_review')
  const sentEvent = events.find((e) => e.to_status === 'awaiting_homeowner')
  const decisionEvent = events.find((e) => e.to_status === 'approved' || e.to_status === 'rejected')
  const actorName = (e: Event | undefined) => (e?.actor ? people[e.actor] : undefined)
  const documentsHref = `/projects/${encodeURIComponent(id)}/documents?category=change_orders`
  const editable = isEditableStatus(co.status)
  const editHref = `${changeOrderPath(id, co.id)}/edit`
  const margin = co.price_adjustment_cents - co.cost_adjustment_cents

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        tone="plain"
        title={co.title}
        eyebrow={
          <span className="tabular-nums">
            {co.co_number}
            {project?.name ? ` · ${project.name}` : ''}
          </span>
        }
        titleAddon={<ChangeOrderStatusBadge status={co.status} />}
        icon={FileDiff}
        backHref={changeOrdersPath(id)}
        backLabel="Change orders"
        actions={
          editable && (
            <Link href={editHref} className={buttonVariants({ variant: 'outline' })}>
              <Pencil className="size-4" aria-hidden="true" />
              Edit change order
            </Link>
          )
        }
      />

      <Surface aria-label="Workflow progress" className="py-5 md:py-5">
        <ChangeOrderStepper status={co.status} />
      </Surface>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <ChangeOrderWorkflow projectId={id} id={co.id} status={co.status} version={co.version} today={todayIso} signatureOptions={signatureOptions} />

          {(co.status === 'approved' || co.status === 'rejected') && (
            <Surface aria-labelledby="co-decision" className={co.status === 'approved' ? 'border-primary/20' : 'border-destructive/20'}>
              <SectionHeading
                id="co-decision"
                title={co.status === 'approved' ? 'Approval' : 'Rejection'}
                description={co.status === 'approved' ? 'Applied to the project budget.' : 'Not applied to the project budget.'}
              />
              <dl className="grid gap-4 text-sm sm:grid-cols-3">
                <Detail label="Homeowner decision by" value={co.decision_by_name} />
                <Detail label="Method" value={methodLabel} />
                <Detail label="Decision date" value={co.decision_at ? formatDate(co.decision_at) : null} />
                <Detail label="Recorded by" value={actorName(decisionEvent)} />
                <Detail label="Signed document" value={linkedSignature?.title ?? (co.signature_request_id ? 'Linked signature request' : 'None')} />
                <Detail label="Version decided" value={decisionEvent ? `v${decisionEvent.version}` : null} />
                {co.decision_note && <Detail label="Note" value={co.decision_note} className="sm:col-span-3" />}
              </dl>
            </Surface>
          )}
          {co.status === 'void' && (
            <Surface aria-labelledby="co-void">
              <SectionHeading id="co-void" title="Voided" description={co.voided_at ? formatDate(co.voided_at) : undefined} />
              <p className="text-sm text-foreground">{co.void_reason}</p>
            </Surface>
          )}

          <ChangeOrderSection id="co-homeowner" audience="homeowner" title="Homeowner summary" description="Exactly what the homeowner is asked to approve. Builder cost is never included.">
            <dl className="grid gap-5 text-sm sm:grid-cols-2">
              <Detail label="Title" value={co.title} className="sm:col-span-2" />
              <Detail label="Description" value={co.description} className="sm:col-span-2" />
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Price change</dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums text-primary">{formatMoney(co.price_adjustment_cents, { signed: true })}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Schedule impact</dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{formatScheduleDays(co.schedule_impact_days, 'long')}</dd>
              </div>
            </dl>
          </ChangeOrderSection>

          <ChangeOrderSection
            id="co-internal"
            audience="internal"
            title="Builder cost and context"
            description="Never shown to the homeowner. Negative amounts are credits."
            flush
            actions={
              editable &&
              lines.length > 0 && (
                <Link href={`${editHref}#co-cost-heading`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                  <Pencil className="size-3.5" aria-hidden="true" />
                  Edit lines
                </Link>
              )
            }
          >
            <dl className="grid gap-5 border-b border-border/70 px-5 py-5 text-sm sm:grid-cols-2 md:px-6">
              <Detail label="Reason for change" value={co.reason} />
              <Detail label="Requested by" value={co.requested_by} />
            </dl>
            {lines.length === 0 ? (
              <div className="flex flex-col items-start gap-3 px-5 py-6 md:px-6">
                <p className="text-sm text-muted-foreground">No builder cost lines yet.</p>
                {editable && (
                  <Link href={`${editHref}#co-cost-heading`} className={buttonVariants({ size: 'sm' })}>
                    <Plus className="size-4" aria-hidden="true" />
                    Add builder cost lines
                  </Link>
                )}
              </div>
            ) : (
              <CostLinesTable lines={lines} totalCents={co.cost_adjustment_cents} marginCents={margin} />
            )}
          </ChangeOrderSection>

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

        <aside className="flex flex-col gap-4 lg:sticky lg:top-20" aria-label="Change order summary">
          <section aria-labelledby="co-summary" className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-xs">
            <div className="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
              <h2 id="co-summary" className="text-sm font-semibold text-foreground">
                Summary
              </h2>
              <ChangeOrderStatusBadge status={co.status} />
            </div>
            <div className="flex flex-col gap-1 bg-sage/40 px-5 py-4">
              <span className="text-xs font-medium text-muted-foreground">Homeowner price change</span>
              <span className="text-2xl font-semibold tabular-nums text-primary">{formatMoney(co.price_adjustment_cents, { signed: true })}</span>
            </div>
            <dl className="flex flex-col gap-3 px-5 py-4 text-sm">
              <SummaryRow label="Schedule impact" value={formatScheduleDays(co.schedule_impact_days, 'long')} />
              <div className="flex items-center gap-2 border-t border-border/60 pt-3 text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">Internal only</div>
              <SummaryRow label={`Builder cost (${lines.length} line${lines.length === 1 ? '' : 's'})`} value={formatMoney(co.cost_adjustment_cents, { signed: true })} />
              <SummaryRow label="Margin on change" value={formatMoney(margin, { signed: true })} tone={margin < 0 ? 'danger' : margin > 0 ? 'positive' : undefined} />
              <div className="flex flex-col gap-3 border-t border-border/60 pt-3">
                <SummaryRow label="Last updated" value={formatDate(co.updated_at)} />
                <SummaryRow label="Created by" value={(co.created_by && people[co.created_by]) || '—'} />
                <SummaryRow label="Created" value={formatDate(co.created_at)} />
                <SummaryRow label="Submitted for review" value={submittedEvent ? joinParts(formatDate(submittedEvent.created_at), actorName(submittedEvent)) : '—'} />
                <SummaryRow label="Sent to homeowner" value={co.sent_to_homeowner_at ? joinParts(formatDate(co.sent_to_homeowner_at), actorName(sentEvent)) : '—'} />
                <SummaryRow label="Version" value={`v${co.version}`} />
              </div>
            </dl>
            <p className="border-t border-border/60 bg-muted/30 px-5 py-3 text-xs leading-relaxed text-muted-foreground">
              Builder cost is recalculated from the cost lines each time the change order is saved. Only approved change orders affect project financials.
            </p>
          </section>

          {features.documents && (
            <Surface aria-labelledby="co-docs" className="p-5 md:p-5">
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

function CostLinesTable({
  lines,
  totalCents,
  marginCents,
}: {
  lines: { id: string; category: string; description: string; quantity: number; unit: string; unit_cost_cents: number; cost_cents: number }[]
  totalCents: number
  marginCents: number
}) {
  return (
    <>
      <ul className="flex flex-col divide-y divide-border/60 md:hidden">
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
        <li className="flex justify-between bg-muted/40 px-5 py-3 text-sm font-semibold">
          <span>Subtotal</span>
          <span className="tabular-nums">{formatMoney(totalCents, { signed: true })}</span>
        </li>
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">Builder cost lines</caption>
          <thead className="bg-muted/40 text-left text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">
            <tr className="border-b border-border/70">
              <th scope="col" className="px-6 py-2.5 font-semibold">Category</th>
              <th scope="col" className="px-3 py-2.5 font-semibold">Description</th>
              <th scope="col" className="px-3 py-2.5 text-right font-semibold">Qty</th>
              <th scope="col" className="px-3 py-2.5 font-semibold">Unit</th>
              <th scope="col" className="px-3 py-2.5 text-right font-semibold">Unit cost</th>
              <th scope="col" className="px-6 py-2.5 text-right font-semibold">Line total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {lines.map((l) => (
              <tr key={l.id} className="hover:bg-muted/30">
                <td className="whitespace-nowrap px-6 py-2.5 text-muted-foreground">{l.category}</td>
                <td className="px-3 py-2.5 text-foreground">{l.description}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{l.quantity}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">{l.unit}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{formatMoney(l.unit_cost_cents)}</td>
                <td className="whitespace-nowrap px-6 py-2.5 text-right font-medium tabular-nums">{formatMoney(l.cost_cents, { signed: true })}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-border/70 bg-muted/30">
            <tr>
              <th scope="row" colSpan={5} className="px-6 py-3 text-right text-sm font-medium text-foreground">
                Subtotal
              </th>
              <td className="px-6 py-3 text-right font-semibold tabular-nums">{formatMoney(totalCents, { signed: true })}</td>
            </tr>
            <tr>
              <th scope="row" colSpan={5} className="px-6 pb-3 text-right text-xs font-medium text-muted-foreground">
                Margin on change
              </th>
              <td className={cn('px-6 pb-3 text-right text-xs font-medium tabular-nums', marginCents < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                {formatMoney(marginCents, { signed: true })}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  )
}

function joinParts(...parts: (string | undefined)[]) {
  return parts.filter(Boolean).join(' · ')
}

function SummaryRow({ label, value, tone }: { label: string; value: string; tone?: 'danger' | 'positive' }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('text-right font-medium tabular-nums text-foreground', tone === 'danger' && 'text-destructive', tone === 'positive' && 'text-primary')}>{value}</dd>
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
