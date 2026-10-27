import Link from 'next/link'
import { Plus, Receipt } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/server'
import { formatCents, formatDate } from '@/lib/format'
import { balanceCents, isOverdue, type InvoiceStatus } from '@/lib/invoices'
import { InvoiceStatusBadge } from '@/components/invoices/invoice-status-badge'

type ProjectInvoice = {
  id: string
  invoice_number: string
  title: string | null
  status: InvoiceStatus
  total_cents: number
  paid_cents: number
  due_date: string
}

export async function ProjectInvoicesPanel({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('invoices')
    .select('id, invoice_number, title, status, total_cents, paid_cents, due_date')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  const invoices = (data ?? []) as ProjectInvoice[]
  const active = invoices.filter((i) => i.status !== 'draft' && i.status !== 'voided')
  const invoiced = active.reduce((sum, i) => sum + i.total_cents, 0)
  const paid = active.reduce((sum, i) => sum + i.paid_cents, 0)
  const outstanding = active.reduce((sum, i) => sum + balanceCents(i), 0)
  const overdueCount = active.filter((i) => isOverdue(i)).length

  return (
    <section aria-labelledby="invoices-heading" className="surface flex flex-col gap-5 p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="invoices-heading" className="flex items-center gap-2 font-serif text-xl text-foreground">
          <Receipt className="size-5 text-primary" aria-hidden="true" />
          Invoices & payments
        </h2>
        {canManage && (
          <Button size="sm" variant="outline" render={<Link href={`/invoices/new?project=${projectId}`} />} nativeButton={false}>
            <Plus data-icon="inline-start" />
            New invoice
          </Button>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: 'Invoiced', value: formatCents(invoiced) },
          { label: 'Paid', value: formatCents(paid) },
          { label: 'Outstanding', value: formatCents(outstanding) },
          { label: 'Overdue', value: String(overdueCount) },
        ].map((stat) => (
          <div key={stat.label} className="flex flex-col gap-1 rounded-lg border bg-muted/40 p-3">
            <dt className="text-xs text-muted-foreground">{stat.label}</dt>
            <dd className="font-medium tabular-nums text-foreground">{stat.value}</dd>
          </div>
        ))}
      </dl>

      {invoices.length === 0 ? (
        <p className="text-sm text-muted-foreground">No invoices for this project yet.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {invoices.map((invoice) => (
            <li key={invoice.id}>
              <Link
                href={`/invoices/${invoice.id}`}
                className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
              >
                <span className="flex flex-col">
                  <span className="font-medium text-foreground">{invoice.invoice_number}</span>
                  <span className="text-muted-foreground">
                    {invoice.title ?? 'Invoice'} · Due {formatDate(invoice.due_date)}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="tabular-nums text-foreground">{formatCents(invoice.total_cents)}</span>
                  <InvoiceStatusBadge status={invoice.status} dueDate={invoice.due_date} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
