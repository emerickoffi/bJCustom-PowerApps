import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { getInvoice } from '@/lib/invoice-queries'
import { InvoiceDocument } from '@/components/invoices/invoice-document'
import { PrintButton } from '@/components/invoices/print-button'

export const metadata: Metadata = { title: 'Print invoice', robots: { index: false } }

export default async function PrintInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const session = await getSession()
  if (!session?.organizationId) redirect('/sign-in')
  const features = await getOrgFeatures(session.organizationId)
  if (!features.invoices && session.role !== 'org_admin') notFound()
  // RLS limits homeowners to their own published invoices; staff see their organization's.
  const data = await getInvoice(id)
  if (!data) notFound()
  const isClient = session.role === 'client'
  if (isClient && data.invoice.status === 'draft') notFound()

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 bg-background p-6 sm:p-10 print:max-w-none print:p-0">
      <div className="flex justify-end print:hidden">
        <PrintButton />
      </div>
      <InvoiceDocument
        invoice={data.invoice}
        lines={data.lines}
        payments={data.payments}
        companyName={session.brand.displayName}
        showReversed={!isClient}
      />
    </main>
  )
}
