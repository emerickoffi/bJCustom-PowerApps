import Link from 'next/link'
import { ArrowRight, Wallet } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatCentsExact } from '@/lib/estimates'
import { formatCents } from '@/lib/format'
import type { InvoiceStatus } from '@/lib/invoices'
import { summarizeContractPrice } from '@/lib/contract-price'
import { latestApprovedEstimate } from '@/components/estimates/project-estimates-panel'
import { cn } from '@/lib/utils'
import { BUDGET_VARIANCE_HELP, describeBudgetVariance } from '@/lib/budget-variance-display'

type Figure = {
  key: string
  label: string
  value: string
  note?: string
  href: string
  unavailable?: boolean
  tone?: 'danger' | 'good'
  title?: string
}

type EstimateRow = { id: string; status: string; construction_total_cents: number; decision_at: string | null; estimate_number: string; revision: number }
type InvoiceRow = { status: InvoiceStatus; subtotal_cents: number | null; total_cents: number; paid_cents: number; due_date: string }
type ChangeOrderRow = { status: string; price_adjustment_cents: number | null }

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const signed = (cents: number) => `${cents < 0 ? '−' : '+'}${formatCentsExact(Math.abs(cents))}`

/**
 * The homeowner's price at a glance, the way builders talk about it: contract price (approved estimate + approved
 * change orders), what is left to bill, what is still owed, and how it compares to the target budget.
 * Uses the same rules as invoice billing limits, so it always agrees with the New invoice screen.
 */
export async function ProjectFinanceStrip({
  projectId,
  budgetCents,
  showEstimates,
  showInvoices,
  financialsHref,
}: {
  projectId: string
  budgetCents: number | null
  showEstimates: boolean
  showInvoices: boolean
  financialsHref: string | null
}) {
  if (!showEstimates && !showInvoices) return null
  const supabase = await createClient()
  const [estRes, coRes, invRes, selRes] = await Promise.all([
    showEstimates
      ? supabase.from('estimates').select('id, status, construction_total_cents, decision_at, estimate_number, revision').eq('project_id', projectId)
      : Promise.resolve({ data: [] as EstimateRow[], error: null }),
    showEstimates
      ? supabase.from('change_orders').select('status, price_adjustment_cents').eq('project_id', projectId)
      : Promise.resolve({ data: [] as ChangeOrderRow[], error: null }),
    showInvoices
      ? supabase.from('invoices').select('status, subtotal_cents, total_cents, paid_cents, due_date').eq('project_id', projectId)
      : Promise.resolve({ data: [] as InvoiceRow[], error: null }),
    supabase.from('selections').select('id', { count: 'exact', head: true }).eq('project_id', projectId).eq('status', 'change_order_required'),
  ])

  const approved = estRes.error ? undefined : latestApprovedEstimate((estRes.data ?? []) as EstimateRow[])
  const s = summarizeContractPrice({
    estimateCents: approved ? approved.construction_total_cents : null,
    changeOrders: coRes.error ? [] : ((coRes.data ?? []) as ChangeOrderRow[]),
    invoices: invRes.error ? [] : ((invRes.data ?? []) as InvoiceRow[]),
    selectionsNeedingChangeOrder: selRes.error ? 0 : (selRes.count ?? 0),
    today: new Date().toISOString().slice(0, 10),
  })

  const estimatesHref = `/projects/${projectId}/estimates`
  const changeOrdersHref = `/projects/${projectId}/change-orders`
  const invoicesHref = financialsHref ? `${financialsHref}?view=invoices` : '/invoices'
  const figures: Figure[] = []

  if (showEstimates) {
    const failed = Boolean(estRes.error || coRes.error)
    figures.push({
      key: 'contract',
      label: 'Contract price',
      value: failed ? 'Unavailable' : s.contractCents === null ? 'No approved estimate' : formatCentsExact(s.contractCents),
      unavailable: failed || s.contractCents === null,
      note:
        s.contractCents === null || failed
          ? undefined
          : s.approvedChangeCount
            ? `Estimate ${formatCentsExact(s.originalCents)} ${signed(s.approvedChangeCents)} in ${plural(s.approvedChangeCount, 'change order')}`
            : 'Approved estimate · no change orders yet',
      href: s.approvedChangeCount ? changeOrdersHref : approved ? `/estimates/${approved.id}` : estimatesHref,
      title: 'Approved estimate plus approved change orders. This is what the homeowner has agreed to pay, before tax.',
    })
  }

  if (showInvoices) {
    const failed = Boolean(invRes.error)
    if (showEstimates) {
      figures.push({
        key: 'left',
        label: 'Left to bill',
        value: failed ? 'Unavailable' : s.leftToBillCents === null ? 'Not available' : formatCentsExact(s.leftToBillCents),
        unavailable: failed || s.leftToBillCents === null,
        tone: !failed && s.leftToBillCents !== null && s.leftToBillCents < 0 ? 'danger' : undefined,
        note: failed ? undefined : `${formatCentsExact(s.billedCents)} billed so far`,
        href: invoicesHref,
      })
    }
    figures.push({
      key: 'balance',
      label: 'Balance due',
      value: failed ? 'Unavailable' : formatCents(s.balanceDueCents),
      unavailable: failed,
      tone: !failed && s.overdueCount > 0 ? 'danger' : undefined,
      note: failed
        ? undefined
        : s.overdueCount
          ? `${formatCents(s.overdueCents)} overdue on ${plural(s.overdueCount, 'invoice')}`
          : `${formatCents(s.paidCents)} paid`,
      href: invoicesHref,
    })
  }

  const hasBudget = budgetCents !== null
  const variance = s.contractCents !== null && hasBudget ? s.contractCents - budgetCents : null
  figures.push({
    key: 'budget',
    label: 'Target budget',
    value: hasBudget ? formatCentsExact(budgetCents) : 'Not set',
    unavailable: !hasBudget,
    ...(showEstimates ? describeBudgetVariance(variance, Boolean(estRes.error)) : {}),
    title: variance !== null ? BUDGET_VARIANCE_HELP : undefined,
    href: financialsHref ?? estimatesHref,
  })

  const heads: { key: string; text: string; href: string }[] = []
  if (showEstimates && s.pendingChangeCount) {
    heads.push({
      key: 'pending',
      text: `${plural(s.pendingChangeCount, 'change order')} waiting for approval (${signed(s.pendingChangeCents)}). Not in the contract price yet.`,
      href: changeOrdersHref,
    })
  }
  if (s.selectionsNeedingChangeOrder) {
    heads.push({
      key: 'selections',
      text: `${plural(s.selectionsNeedingChangeOrder, 'selection')} over allowance ${s.selectionsNeedingChangeOrder === 1 ? 'needs' : 'need'} a change order.`,
      href: `/projects/${projectId}/selections`,
    })
  }

  return (
    <section id="invoices-heading" aria-labelledby="finance-summary-heading" className="surface flex scroll-mt-36 flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="finance-summary-heading" className="flex items-center gap-2 type-section-title text-foreground">
          <Wallet className="size-4 text-primary" aria-hidden="true" />
          Contract and billing
        </h2>
        {financialsHref && (
          <Link
            href={financialsHref}
            className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Open financials
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        )}
      </div>
      <ul className={cn('grid grid-cols-2 gap-2', figures.length >= 4 && 'lg:grid-cols-4', figures.length === 3 && 'md:grid-cols-3')}>
        {figures.map((f) => (
          <li key={f.key} className="min-w-0">
            <Link
              href={f.href}
              className="flex h-full min-h-11 flex-col gap-1 rounded-xl border border-[#D6DDE5] bg-[#F8F9FA] p-3 transition-colors hover:border-primary/40 hover:bg-[#F3F4F6] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="text-xs font-medium text-muted-foreground">{f.label}</span>
              <span
                className={cn(
                  'break-words',
                  f.unavailable
                    ? 'text-sm font-medium italic text-muted-foreground'
                    : 'type-financial text-foreground',
                  !f.unavailable && f.tone === 'danger' && 'text-destructive',
                  !f.unavailable && f.tone === 'good' && 'text-primary',
                )}
              >
                {f.value}
              </span>
              {f.note && <span className="mt-auto text-xs text-muted-foreground">{f.note}</span>}
              {f.title && <span className="sr-only">{f.title}</span>}
            </Link>
          </li>
        ))}
      </ul>
      {heads.length > 0 && (
        <ul className="flex flex-col gap-1">
          {heads.map((h) => (
            <li key={h.key}>
              <Link href={h.href} className="text-sm text-[#8A4B08] underline-offset-4 hover:underline">
                {h.text}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
