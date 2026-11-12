import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronRight, ListChecks, Plus } from 'lucide-react'
import { requireManager } from '@/lib/session'
import { requireFeature } from '@/lib/features'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/financials'
import { formatDate } from '@/lib/format'
import { getProjectSelections } from '@/lib/selections-data'
import { STATUS_LABELS, STATUS_TONES, allowanceDelta, isOverdue, selectionPath, selectionsPath } from '@/lib/selections'
import { PageHeader, Surface } from '@/components/shared/page-header'
import { SemanticBadge } from '@/components/shared/semantic-badge'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = { title: 'Selections' }

export default async function SelectionsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireManager()
  await requireFeature(session.organizationId, 'estimates')
  const { id } = await params
  const supabase = await createClient()
  const [{ data: project }, { rows, error }] = await Promise.all([
    supabase.from('projects').select('id, name').eq('id', id).maybeSingle(),
    getProjectSelections(id),
  ])
  if (!project) notFound()

  const open = rows.filter((r) => !['approved', 'rejected', 'canceled'].includes(r.status))
  const waiting = rows.filter((r) => r.status === 'awaiting_homeowner').length
  const review = rows.filter((r) => r.status === 'awaiting_builder_review' || r.status === 'change_order_required').length
  const overdue = rows.filter((r) => isOverdue(r.due_date, r.status)).length
  const netDelta = rows
    .filter((r) => r.status !== 'canceled' && r.status !== 'rejected')
    .reduce((sum, r) => sum + (allowanceDelta(r.allowance_cents, r.selected_price_cents) ?? 0), 0)

  const groups = new Map<string, typeof rows>()
  for (const r of rows) groups.set(r.category, [...(groups.get(r.category) ?? []), r])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Selections"
        icon={ListChecks}
        count={{ value: open.length, noun: 'open' }}
        actions={
          <Button render={<Link href={`${selectionsPath(id)}/new`} />} nativeButton={false}>
            <Plus className="size-4" aria-hidden="true" />
            New selection
          </Button>
        }
      />

      {error ? (
        <Surface role="alert">
          <p className="text-sm text-destructive">Selections could not be loaded. Try again shortly.</p>
        </Surface>
      ) : rows.length === 0 ? (
        <Surface>
          <div className="flex flex-col gap-1">
            <h2 className="type-section-title text-foreground">No selections yet</h2>
            <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
              Add finishes and fixtures the homeowner needs to choose, with allowances and options. Choices that go over the allowance route through a change order.
            </p>
          </div>
        </Surface>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Waiting on homeowner" value={String(waiting)} />
            <Stat label="Needs your review" value={String(review)} emphasis={review > 0} />
            <Stat label="Overdue" value={String(overdue)} danger={overdue > 0} />
            <Stat label="Net vs allowances" value={formatMoney(netDelta, { signed: true })} />
          </dl>

          {[...groups.entries()].map(([category, items]) => (
            <section key={category} aria-labelledby={`cat-${category}`} className="flex flex-col gap-2">
              <h2 id={`cat-${category}`} className="type-section-title text-foreground">
                {category}
              </h2>
              <ul className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card">
                {items.map((r) => {
                  const delta = allowanceDelta(r.allowance_cents, r.selected_price_cents)
                  const late = isOverdue(r.due_date, r.status)
                  return (
                    <li key={r.id}>
                      <Link href={selectionPath(id, r.id)} className="group flex flex-wrap items-center justify-between gap-3 p-4 transition-colors hover:bg-muted/40">
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="truncate font-medium text-foreground">{r.name}</span>
                          <span className={late ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>
                            {[r.location, r.due_date ? `${late ? 'Overdue since' : 'Due'} ${formatDate(r.due_date)}` : null].filter(Boolean).join(' · ') || 'No due date'}
                          </span>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="flex flex-col items-end text-sm tabular-nums">
                            <span className="text-foreground">{r.allowance_cents === null ? 'No allowance' : `Allowance ${formatMoney(r.allowance_cents)}`}</span>
                            {delta !== null && (
                              <span className={delta > 0 ? 'text-orange-700 dark:text-orange-400' : 'text-muted-foreground'}>{formatMoney(delta, { signed: true })}</span>
                            )}
                          </div>
                          <SemanticBadge tone={STATUS_TONES[r.status]}>{STATUS_LABELS[r.status]}</SemanticBadge>
                          <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  )
}

function Stat({ label, value, emphasis, danger }: { label: string; value: string; emphasis?: boolean; danger?: boolean }) {
  return (
    <div className="surface flex min-w-0 flex-col gap-1 p-4">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={`text-xl font-semibold tabular-nums ${danger ? 'text-destructive' : emphasis ? 'text-primary' : 'text-foreground'}`}>{value}</dd>
    </div>
  )
}
