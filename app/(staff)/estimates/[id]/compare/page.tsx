import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireStaff } from '@/lib/session'
import { getEstimate, getEstimateFamily, getEstimateLineItems, type EstimateRecord } from '@/lib/estimate-queries'
import { ESTIMATE_CATEGORIES, formatCentsExact, type EstimateLineItem } from '@/lib/estimates'
import { PageHeader } from '@/components/shared/page-header'
import { EstimateStatusBadge } from '@/components/estimates/estimate-status-badge'
import { cn } from '@/lib/utils'
import { GitCompareArrows as GitCompareArrowsIcon } from 'lucide-react'

export const metadata: Metadata = { title: 'Compare revisions' }

const UUID = /^[0-9a-f-]{36}$/i

function Delta({ value }: { value: number }) {
  if (value === 0) return <span className="text-muted-foreground">{'—'}</span>
  return (
    <span className={cn('font-medium', value > 0 ? 'text-warning' : 'text-primary')}>
      {`${value > 0 ? '+' : '−'}${formatCentsExact(Math.abs(value))}`}
    </span>
  )
}

function byCategory(items: EstimateLineItem[]) {
  const map = new Map<string, number>()
  for (const i of items) map.set(i.category, (map.get(i.category) ?? 0) + i.line_total_cents)
  return map
}

export default async function CompareRevisionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ with?: string }>
}) {
  const session = await requireStaff()
  const { id } = await params
  const { with: otherId } = await searchParams
  if (!UUID.test(id)) notFound()
  const current = await getEstimate(id, session.organizationId)
  if (!current) notFound()
  const family = await getEstimateFamily(current.family_id)
  const otherRef = family.find((f) => f.id === otherId) ?? family.find((f) => f.id !== id)

  if (!otherRef) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader icon={GitCompareArrowsIcon} backHref={`/estimates/${id}`} backLabel="Estimate" title="Compare revisions" description="This estimate has only one revision." />
      </div>
    )
  }

  const other = await getEstimate(otherRef.id, session.organizationId)
  if (!other) notFound()
  const [a, b] = current.revision < other.revision ? [current, other] : [other, current]
  const [aItems, bItems] = await Promise.all([getEstimateLineItems(a.id), getEstimateLineItems(b.id)])
  const aCat = byCategory(aItems)
  const bCat = byCategory(bItems)
  const categories = ESTIMATE_CATEGORIES.filter((c) => aCat.has(c) || bCat.has(c))

  const summaryRows: { label: string; key: keyof EstimateRecord }[] = [
    { label: 'Direct costs', key: 'direct_cost_cents' },
    { label: 'Markup', key: 'markup_cents' },
    { label: 'Allowances', key: 'allowance_cents' },
    { label: 'Contingency', key: 'contingency_cents' },
    { label: 'Construction total', key: 'construction_total_cents' },
    { label: 'Land cost', key: 'land_cost_cents' },
    { label: 'Total including land', key: 'total_with_land_cents' },
  ]

  return (
    <div className="flex flex-col gap-8">
      <PageHeader icon={GitCompareArrowsIcon}
        backHref={`/estimates/${id}`}
        backLabel="Estimate"
        eyebrow={<span className="font-mono">{current.estimate_number}</span>}
        title="Compare revisions"
        description={current.name}
        actions={
          family.length > 2 && (
            <form method="get" className="flex items-center gap-2">
              <label htmlFor="with" className="text-sm text-muted-foreground">
                Compare with
              </label>
              <select
                id="with"
                name="with"
                defaultValue={otherRef.id}
                className="h-10 rounded-lg border border-input bg-card px-2.5 text-sm"
              >
                {family
                  .filter((f) => f.id !== id)
                  .map((f) => (
                    <option key={f.id} value={f.id}>{`Revision ${f.revision}`}</option>
                  ))}
              </select>
              <button type="submit" className="h-10 rounded-lg border px-3 text-sm font-medium hover:bg-sage/50">
                Go
              </button>
            </form>
          )
        }
      />

      <div className="surface overflow-x-auto p-0">
        <table className="w-full min-w-[36rem] text-sm">
          <thead className="border-b border-border bg-muted/50 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <tr>
              <th scope="col" className="px-5 py-3">Line</th>
              {[a, b].map((r) => (
                <th key={r.id} scope="col" className="px-3 py-3 text-right">
                  <Link href={`/estimates/${r.id}`} className="flex flex-col items-end gap-1 normal-case hover:text-primary">
                    <span className="text-sm font-semibold text-foreground">{`Revision ${r.revision}`}</span>
                    <EstimateStatusBadge status={r.status} />
                  </Link>
                </th>
              ))}
              <th scope="col" className="px-5 py-3 text-right">Change</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <tr className="bg-sage/40">
              <th colSpan={4} scope="colgroup" className="px-5 py-2 text-left text-xs font-semibold uppercase tracking-wide text-primary">
                By category
              </th>
            </tr>
            {categories.map((c) => {
              const av = aCat.get(c) ?? 0
              const bv = bCat.get(c) ?? 0
              return (
                <tr key={c}>
                  <th scope="row" className="px-5 py-2.5 text-left font-normal text-foreground">{c}</th>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatCentsExact(av)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatCentsExact(bv)}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums"><Delta value={bv - av} /></td>
                </tr>
              )
            })}
            <tr className="bg-sage/40">
              <th colSpan={4} scope="colgroup" className="px-5 py-2 text-left text-xs font-semibold uppercase tracking-wide text-primary">
                Summary
              </th>
            </tr>
            {summaryRows.map((row) => {
              const av = Number(a[row.key] ?? 0)
              const bv = Number(b[row.key] ?? 0)
              const strong = row.key === 'construction_total_cents'
              return (
                <tr key={row.key} className={cn(strong && 'font-semibold')}>
                  <th scope="row" className={cn('px-5 py-2.5 text-left text-foreground', !strong && 'font-normal')}>
                    {row.label}
                  </th>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {row.key === 'land_cost_cents' && a.land_cost_cents === null ? '—' : formatCentsExact(av)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {row.key === 'land_cost_cents' && b.land_cost_cents === null ? '—' : formatCentsExact(bv)}
                  </td>
                  <td className="px-5 py-2.5 text-right tabular-nums"><Delta value={bv - av} /></td>
                </tr>
              )
            })}
            <tr>
              <th scope="row" className="px-5 py-2.5 text-left font-normal text-foreground">Line items</th>
              <td className="px-3 py-2.5 text-right tabular-nums">{aItems.length}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{bItems.length}</td>
              <td className="px-5 py-2.5 text-right tabular-nums text-muted-foreground">
                {bItems.length - aItems.length === 0 ? '—' : `${bItems.length - aItems.length > 0 ? '+' : ''}${bItems.length - aItems.length}`}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
