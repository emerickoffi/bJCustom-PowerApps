import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Printer } from 'lucide-react'
import { getSession } from '@/lib/session'
import { getInvoice } from '@/lib/invoice-queries'
import { Button } from '@/components/ui/button'
import { InvoiceDocument } from '@/components/invoices/invoice-document'

export const metadata: Metadata = { title: 'Invoice' }

export default async function PortalInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const session = await getSession()
  if (!session) redirect('/sign-in')
  const data = await getInvoice(id)
  if (!data || data.invoice.status === 'draft') notFound()

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/portal/invoices" className="text-sm text-muted-foreground hover:text-primary">
          All invoices
        </Link>
        <Button variant="outline" render={<Link href={`/invoices/${id}/print`} target="_blank" />} nativeButton={false}>
          <Printer data-icon="inline-start" />
          Print / PDF
        </Button>
      </div>
      <InvoiceDocument invoice={data.invoice} lines={data.lines} payments={data.payments} companyName={session.brand.displayName} />
      <p className="text-sm text-muted-foreground">
        Questions about this invoice? Contact your project manager. Online payment is not available yet; please follow the
        payment instructions above.
      </p>
    </div>
  )
}
