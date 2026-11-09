import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import type { InvoiceRow } from '@/lib/invoice-queries'
import { balanceCents } from '@/lib/invoices'
import { formatCentsExact } from '@/lib/estimates'
import { formatDate } from '@/lib/format'
import { InvoiceStatusBadge } from '@/components/invoices/invoice-status-badge'
import { PageHeader } from '@/components/shared/page-header'
import { Receipt } from 'lucide-react'

export const metadata: Metadata = { title: 'Invoices' }

export default async function PortalInvoicesPage() {
  const session = await getSession()
  if (!session) redirect('/sign-in')
  const supabase = await createClient()
  // RLS returns only issued, published invoices on projects this homeowner is linked to.
  const { data } = await supabase
    .from('invoices')
    .select('id, invoice_number, title, due_date, total_cents, paid_cents, status, project:projects(name)')
    .neq('status', 'draft')
    .order('invoice_date', { ascending: false })
  const invoices = (data ?? []) as unknown as (Pick<
    InvoiceRow,
    'id' | 'invoice_number' | 'title' | 'due_date' | 'total_cents' | 'paid_cents' | 'status'
  > & { project: { name: string } | null })[]
  const owed = invoices.reduce((sum, i) => sum + balanceCents(i), 0)

  return (
    <div className="flex w-full min-w-0 flex-col gap-5 md:gap-6">
      <PageHeader
        icon={Receipt}
        title="Invoices"
        count={{ value: invoices.length, noun: 'invoice' }}
        backHref="/portal"
        backLabel="Back to your home"
        meta={
          <span>
            Balance due across all invoices: <span className="font-semibold text-foreground">{formatCentsExact(owed)}</span>
          </span>
        }
      />
      {invoices.length === 0 ? (
        <p className="surface p-6 text-sm text-muted-foreground">Your builder has not shared any invoices yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {invoices.map((inv) => (
            <li key={inv.id}>
              <Link
                href={`/portal/invoices/${inv.id}`}
                className="surface flex flex-wrap items-center justify-between gap-3 p-5 transition-colors hover:border-primary/40"
              >
                <div className="flex flex-col">
                  <span className="font-medium">
                    {inv.invoice_number} · {inv.title}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {inv.project?.name} · Due {formatDate(inv.due_date)}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="tabular-nums">{formatCentsExact(balanceCents(inv))} due</span>
                  <InvoiceStatusBadge status={inv.status} dueDate={inv.due_date} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
