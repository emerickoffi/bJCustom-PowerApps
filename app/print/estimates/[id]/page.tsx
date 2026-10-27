import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { requireStaff } from '@/lib/session'
import { clientDisplayName, getEstimate, getEstimateLineItems } from '@/lib/estimate-queries'
import {
  ESTIMATE_CATEGORIES,
  ESTIMATE_STATUS_LABELS,
  formatCentsExact,
  formatPercent,
  formatQuantity,
  type EstimateLineItem,
} from '@/lib/estimates'
import { formatAddress, formatDate } from '@/lib/format'
import { PrintButton } from '@/components/estimates/print-button'

export const metadata: Metadata = { title: 'Estimate PDF', robots: { index: false } }

export default async function EstimatePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaff()
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const estimate = await getEstimate(id, session.organizationId)
  if (!estimate) notFound()
  const items = await getEstimateLineItems(id)
  const brand = session.brand

  const groups = ESTIMATE_CATEGORIES.map((category) => {
    const rows = items.filter((i) => i.category === category)
    return { category, rows, total: rows.reduce((sum, r) => sum + r.line_total_cents, 0) }
  }).filter((g) => g.rows.length > 0)

  const orEmpty = (value: string) => (value === '—' ? '' : value)
  const projectAddress = estimate.project ? orEmpty(formatAddress(estimate.project)) : ''
  const companyAddress = orEmpty(
    formatAddress({
      address_line1: brand.addressLine1,
      city: brand.city,
      state: brand.state,
      postal_code: brand.postalCode,
    }),
  )
  const clientName = clientDisplayName(estimate.client)
  const unitCost = (i: EstimateLineItem) => i.material_unit_cents + i.labor_unit_cents + i.other_unit_cents

  const summaryRows: [string, number | null, boolean?][] = [
    ['Materials', estimate.material_cents],
    ['Labor', estimate.labor_cents],
    ['Other costs', estimate.other_cents],
    ['Direct cost', estimate.direct_cost_cents, true],
    ['Allowances', estimate.allowance_cents],
    [`Markup (${formatPercent(estimate.markup_percent)})`, estimate.markup_cents],
    [`Contingency (${formatPercent(estimate.contingency_percent)})`, estimate.contingency_cents],
  ]

  return (
    <div className="min-h-dvh bg-muted/40 py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-6 flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 print:hidden">
        <Button variant="ghost" size="lg" render={<Link href={`/estimates/${estimate.id}`} />} nativeButton={false}>
          <ArrowLeft data-icon="inline-start" />
          Back to estimate
        </Button>
        <PrintButton />
      </div>

      <article className="mx-auto flex max-w-4xl flex-col gap-8 bg-white p-8 text-sm text-neutral-900 shadow-sm sm:p-12 print:max-w-none print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-neutral-200 pb-6">
          <div className="flex items-start gap-4">
            {brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- organization logos are arbitrary remote URLs
              <img src={brand.logoUrl || '/placeholder.svg'} alt="" className="size-14 object-contain" crossOrigin="anonymous" />
            ) : null}
            <div className="flex flex-col gap-1">
              <p className="font-serif text-xl font-semibold">{brand.legalName || brand.displayName}</p>
              {companyAddress ? <p className="text-neutral-600">{companyAddress}</p> : null}
              <p className="text-neutral-600">{[brand.phone, brand.email, brand.website].filter(Boolean).join(' · ')}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 text-right">
            <h1 className="font-serif text-2xl font-semibold">Estimate</h1>
            <p className="font-mono text-neutral-700">
              {estimate.estimate_number} · Rev {estimate.revision}
            </p>
            <p className="text-neutral-600">Status: {ESTIMATE_STATUS_LABELS[estimate.status]}</p>
          </div>
        </header>

        <section className="grid gap-6 sm:grid-cols-3" aria-label="Estimate details">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Prepared for</p>
            <p className="font-medium">{clientName ?? 'Client not assigned'}</p>
            {estimate.client?.email ? <p className="text-neutral-600">{estimate.client.email}</p> : null}
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Project</p>
            <p className="font-medium">{estimate.project?.name}</p>
            {projectAddress ? <p className="text-neutral-600">{projectAddress}</p> : null}
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Dates</p>
            <p>Issued {formatDate(estimate.estimate_date)}</p>
            <p className="text-neutral-600">
              {estimate.expiration_date ? `Valid until ${formatDate(estimate.expiration_date)}` : 'No expiration date'}
            </p>
          </div>
        </section>

        <div className="flex flex-col gap-1">
          <h2 className="font-serif text-lg font-semibold">{estimate.name}</h2>
          {estimate.description ? <p className="whitespace-pre-line text-neutral-700">{estimate.description}</p> : null}
        </div>

        {groups.length === 0 ? (
          <p className="text-neutral-600">This estimate has no line items yet.</p>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b-2 border-neutral-300 text-xs uppercase tracking-wide text-neutral-500">
                <th scope="col" className="py-2 pr-3 font-medium">
                  Description
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  Qty
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  Unit cost
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Total
                </th>
              </tr>
            </thead>
            {groups.map((g) => (
              <tbody key={g.category} className="break-inside-avoid">
                <tr className="border-b border-neutral-200 bg-neutral-50">
                  <th scope="rowgroup" colSpan={3} className="py-2 pr-3 pl-2 font-semibold">
                    {g.category}
                  </th>
                  <td className="py-2 pr-2 text-right font-semibold tabular-nums">{formatCentsExact(g.total)}</td>
                </tr>
                {g.rows.map((r) => (
                  <tr key={r.id} className="border-b border-neutral-100 align-top">
                    <td className="py-2 pr-3 pl-2">
                      {r.description}
                      {r.is_allowance ? <span className="ml-2 text-xs text-neutral-500">(Allowance)</span> : null}
                      {r.notes ? <p className="text-xs text-neutral-500">{r.notes}</p> : null}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {formatQuantity(r.quantity)} {r.unit}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatCentsExact(unitCost(r))}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{formatCentsExact(r.line_total_cents)}</td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        )}

        <section className="flex justify-end break-inside-avoid" aria-label="Totals">
          <dl className="flex w-full max-w-sm flex-col gap-1.5">
            {summaryRows.map(([label, value, strong]) => (
              <div key={label} className={strong ? 'flex justify-between border-t border-neutral-200 pt-1.5 font-medium' : 'flex justify-between'}>
                <dt className="text-neutral-600">{label}</dt>
                <dd className="tabular-nums">{formatCentsExact(value)}</dd>
              </div>
            ))}
            <div className="flex justify-between border-t-2 border-neutral-900 pt-2 text-base font-semibold">
              <dt>Construction total</dt>
              <dd className="tabular-nums">{formatCentsExact(estimate.construction_total_cents)}</dd>
            </div>
            {estimate.land_cost_cents !== null ? (
              <>
                <div className="flex justify-between text-neutral-600">
                  <dt>Land cost (separate)</dt>
                  <dd className="tabular-nums">{formatCentsExact(estimate.land_cost_cents)}</dd>
                </div>
                <div className="flex justify-between font-semibold">
                  <dt>Total including land</dt>
                  <dd className="tabular-nums">{formatCentsExact(estimate.total_with_land_cents)}</dd>
                </div>
              </>
            ) : null}
          </dl>
        </section>

        {estimate.notes ? (
          <section className="flex flex-col gap-1 break-inside-avoid">
            <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-500">Notes and terms</h2>
            <p className="whitespace-pre-line text-neutral-700">{estimate.notes}</p>
          </section>
        ) : null}

        <section className="grid gap-10 pt-8 sm:grid-cols-2 break-inside-avoid" aria-label="Acceptance">
          {['Homeowner signature', 'Contractor signature'].map((label) => (
            <div key={label} className="flex flex-col gap-1">
              <div className="h-10 border-b border-neutral-400" />
              <p className="text-xs text-neutral-500">{label} · Date</p>
            </div>
          ))}
        </section>
      </article>
    </div>
  )
}
