import Link from 'next/link'
import { ArrowRight, Wallet } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatCentsExact } from '@/lib/estimates'
import { formatCents } from '@/lib/format'
import { balanceCents, isOverdue, type InvoiceStatus } from '@/lib/invoices'
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
type InvoiceRow = { status: InvoiceStatus; total_cents: number; paid_cents: number; due_date: string }

/**
 * One compact row of headline money figures. Uses the same rules as the Estimates and Invoices panels
 * (latest approved revision; issued and partially paid invoices) so the numbers always agree with them.
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
  const [estRes, invRes] = await Promise.all([
    showEstimates
      ? supabase.from('estimates').select('id, status, construction_total_cents, decision_at, estimate_number, revision').eq('project_id', projectId)
      : Promise.resolve({ data: [] as EstimateRow[], error: null }),
    showInvoices
      ? supabase.from('invoices').select('status, total_cents, paid_cents, due_date').eq('project_id', projectId)
      : Promise.resolve({ data: [] as InvoiceRow[], error: null }),
  ])

  const estimatesHref = `/projects/${projectId}/estimates`
  const invoicesHref = financialsHref ? `${financialsHref}?view=invoices` : '/invoices'
  const hasBudget = budgetCents !== null
  const figures: Figure[] = [
    {
      key: 'budget',
      label: 'Project budget',
      value: hasBudget ? formatCentsExact(budgetCents) : 'Not set',
      unavailable: !hasBudget,
      href: financialsHref ?? estimatesHref,
    },
  ]

  if (showEstimates) {
    const approved = estRes.error ? undefined : latestApprovedEstimate((estRes.data ?? []) as EstimateRow[])
    const variance = approved && hasBudget ? approved.construction_total_cents - budgetCents : null
    figures.push(
      {
        key: 'approved',
        label: 'Approved estimate',
        value: estRes.error ? 'Unavailable' : approved ? formatCentsExact(approved.construction_total_cents) : 'None approved',
        unavailable: Boolean(estRes.error) || !approved,
        note: approved ? `${approved.estimate_number} rev ${approved.revision}` : undefined,
        href: approved ? `/estimates/${approved.id}` : estimatesHref,
      },
      {
        key: 'variance',
        label: 'Budget variance',
        value: estRes.error ? 'Unavailable' : variance === null ? 'Not available' : `${variance > 0 ? '+' : ''}${formatCentsExact(variance)}`,
        unavailable: Boolean(estRes.error) || variance === null,
        ...describeBudgetVariance(variance, Boolean(estRes.error)),
        title: variance !== null ? BUDGET_VARIANCE_HELP : undefined,
        href: estimatesHref,
      },
    )
  }

  if (showInvoices) {
    const active = ((invRes.data ?? []) as InvoiceRow[]).filter((i) => i.status !== 'draft' && i.status !== 'voided')
    const outstanding = active.reduce((sum, i) => sum + balanceCents(i), 0)
    const invoiced = active.reduce((sum, i) => sum + i.total_cents, 0)
    const overdue = active.filter((i) => isOverdue(i))
    const overdueCents = overdue.reduce((sum, i) => sum + balanceCents(i), 0)
    figures.push(
      {
        key: 'outstanding',
        label: 'Outstanding invoices',
        value: invRes.error ? 'Unavailable' : formatCents(outstanding),
        unavailable: Boolean(invRes.error),
        note: invRes.error ? undefined : active.length ? `${formatCents(invoiced)} invoiced` : 'Nothing invoiced yet',
        href: invoicesHref,
      },
      {
        key: 'overdue',
        label: 'Overdue invoices',
        value: invRes.error ? 'Unavailable' : String(overdue.length),
        unavailable: Boolean(invRes.error),
        tone: !invRes.error && overdue.length > 0 ? 'danger' : undefined,
        note: invRes.error ? undefined : overdue.length ? `${formatCents(overdueCents)} past due` : 'None overdue',
        href: invoicesHref,
      },
    )
  }

  return (
    <section id="invoices-heading" aria-labelledby="finance-summary-heading" className="surface flex scroll-mt-36 flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="finance-summary-heading" className="flex items-center gap-2 type-section-title text-foreground">
          <Wallet className="size-4 text-primary" aria-hidden="true" />
          Financial summary
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
      <ul className={cn('grid grid-cols-2 gap-2', figures.length >= 3 && 'md:grid-cols-3', figures.length >= 5 && 'xl:grid-cols-5')}>
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
    </section>
  )
}
