import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ListChecks } from 'lucide-react'
import { canManage, requireManager } from '@/lib/session'
import { getOrgFeatures, requireFeature } from '@/lib/features'
import { formatMoney } from '@/lib/financials'
import { formatDate, formatDateTime } from '@/lib/format'
import { changeOrderPath } from '@/lib/change-orders'
import { getSelectionCategories, getSelectionDetail, getSelectionLocations } from '@/lib/selections-data'
import { STATUS_LABELS, STATUS_TONES, availableActions, isOverdue, selectionsPath } from '@/lib/selections'
import { PageHeader, Surface } from '@/components/shared/page-header'
import { SemanticBadge } from '@/components/shared/semantic-badge'
import { OptionEditor } from '@/components/selections/option-editor'
import { WorkflowPanel } from '@/components/selections/workflow-panel'
import { SelectionHistory } from '@/components/selections/selection-history'
import { SelectionForm } from '@/components/selections/selection-form'

export const metadata: Metadata = { title: 'Selection' }

const OPEN_CO = new Set(['draft', 'internal_review', 'awaiting_homeowner'])

export default async function SelectionDetailPage({ params }: { params: Promise<{ id: string; selectionId: string }> }) {
  const session = await requireManager()
  await requireFeature(session.organizationId, 'estimates')
  const { id, selectionId } = await params
  const [s, categories, locations, features] = await Promise.all([
    getSelectionDetail(id, selectionId),
    getSelectionCategories(),
    getSelectionLocations(),
    getOrgFeatures(session.organizationId),
  ])
  const coEnabled = Boolean(features.change_orders)
  if (!s) notFound()

  const currentCos = s.changeOrders.filter((c) => c.selection_revision === s.revision)
  const changeOrderApproved = currentCos.some((c) => c.status === 'approved')
  const hasOpenCo = currentCos.some((c) => OPEN_CO.has(c.status))
  const needsChangeOrder = (s.amounts.difference_cents ?? 0) !== 0 && s.amounts.change_order_needed_cents !== 0
  const actions = availableActions(s.status, { changeOrderApproved, needsChangeOrder })
  const canCreateChangeOrder = coEnabled && s.status === 'change_order_required' && s.amounts.change_order_needed_cents !== 0 && !hasOpenCo
  const selected = s.options.find((o) => o.id === s.selected_option_id)
  const late = isOverdue(s.due_date, s.status)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={s.name}
        icon={ListChecks}
        backHref={selectionsPath(id)}
        backLabel="Selections"
        meta={
          <span className="flex flex-wrap items-center gap-2">
            <SemanticBadge tone={STATUS_TONES[s.status]}>{STATUS_LABELS[s.status]}</SemanticBadge>
            <span>{[s.category, s.location, s.revision > 1 ? `Revision ${s.revision}` : null].filter(Boolean).join(' · ')}</span>
          </span>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Allowance" value={s.allowance_cents === null ? 'None' : formatMoney(s.allowance_cents)} />
            <Stat label="Selected price" value={s.selected_price_cents === null ? '—' : formatMoney(s.selected_price_cents)} />
            <Stat label="Difference" value={s.amounts.difference_cents === null ? '—' : formatMoney(s.amounts.difference_cents, { signed: true })} />
            <Stat label="Due" value={s.due_date ? formatDate(s.due_date) : 'No date'} danger={late} />
          </dl>

          {selected && (
            <Surface>
              <div className="flex flex-col gap-1">
                <h2 className="type-section-title text-foreground">Homeowner&apos;s choice</h2>
                <p className="text-sm text-foreground">
                  {selected.name} at {formatMoney(s.selected_price_cents)}
                  {s.selected_by_name && ` · chosen by ${s.selected_by_name}`}
                  {s.selected_at && ` on ${formatDateTime(s.selected_at)}`}
                </p>
                {s.homeowner_comment && <p className="mt-2 whitespace-pre-line rounded-lg bg-muted p-3 text-sm text-foreground">{s.homeowner_comment}</p>}
              </div>
            </Surface>
          )}

          <section id="options" aria-labelledby="options-heading" className="flex scroll-mt-24 flex-col gap-3">
            <h2 id="options-heading" className="type-section-title text-foreground">
              Options
            </h2>
            <OptionEditor
              projectId={id}
              selectionId={s.id}
              options={s.options}
              editable={s.status === 'draft'}
              allowanceCents={s.allowance_cents}
              selectedOptionId={s.selected_option_id}
            />
            {s.status !== 'draft' && s.status !== 'canceled' && (
              <p className="text-xs text-muted-foreground">Recall or reopen the selection to change its options.</p>
            )}
          </section>

          {s.status === 'draft' ? (
            <Surface>
              <details>
                <summary className="cursor-pointer type-section-title text-foreground">Edit details</summary>
                <div className="mt-4">
                  <SelectionForm projectId={id} categories={categories} locations={locations} canCreateCategory={canManage(session.role)} initial={s} />
                </div>
              </details>
            </Surface>
          ) : (
            (s.description || s.notes || s.internal_notes) && (
              <Surface>
                <dl className="flex flex-col gap-3 text-sm">
                  {s.description && <Detail label="Description" value={s.description} />}
                  {s.notes && <Detail label="Notes for homeowner" value={s.notes} />}
                  {s.internal_notes && <Detail label="Internal notes" value={s.internal_notes} />}
                </dl>
              </Surface>
            )
          )}
        </div>

        <aside className="flex flex-col gap-6">
          <Surface>
            <div className="flex flex-col gap-3">
              <h2 className="type-section-title text-foreground">Next step</h2>
              <WorkflowPanel projectId={id} selectionId={s.id} version={s.version} actions={actions} canCreateChangeOrder={canCreateChangeOrder} />
            </div>
          </Surface>

          {s.changeOrders.length > 0 && (
            <Surface>
              <div className="flex flex-col gap-3">
                <h2 className="type-section-title text-foreground">Change orders</h2>
                <ul className="flex flex-col gap-2">
                  {s.changeOrders.map((c) => (
                    <li key={c.id}>
                      <Link href={changeOrderPath(id, c.id)} className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm hover:bg-muted/40">
                        <span className="min-w-0 truncate">
                          <span className="font-mono text-xs text-muted-foreground">{c.co_number ?? `#${c.number}`}</span> {c.title}
                        </span>
                        <span className="shrink-0 tabular-nums">{formatMoney(c.price_adjustment_cents, { signed: true })}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">Approved for this revision: {formatMoney(s.amounts.approved_change_orders_cents, { signed: true })}</p>
              </div>
            </Surface>
          )}

          <Surface>
            <div className="flex flex-col gap-3">
              <h2 className="type-section-title text-foreground">History</h2>
              <SelectionHistory events={s.events} showInternal />
            </div>
          </Surface>
        </aside>
      </div>
    </div>
  )
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="surface flex min-w-0 flex-col gap-1 p-4">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={`text-lg font-semibold tabular-nums ${danger ? 'text-destructive' : 'text-foreground'}`}>{value}</dd>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-line text-pretty text-foreground">{value}</dd>
    </div>
  )
}
