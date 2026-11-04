import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getSession } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { getInvoice } from '@/lib/invoice-queries'
import { invoiceReturnTarget } from '@/lib/invoice-return'
import { InvoiceDocument } from '@/components/invoices/invoice-document'
import { PrintButton } from '@/components/invoices/print-button'

export const metadata: Metadata = { title: 'Print invoice', robots: { index: false } }

export default async function PrintInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ from?: string | string[] }>
}) {
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

  const back = isClient
    ? { href: '/portal/invoices', label: 'Back to invoices' }
    : invoiceReturnTarget((await searchParams).from)

  return (
    <main data-print-document className="mx-auto flex max-w-4xl flex-col gap-6 bg-background p-6 sm:p-10 print:max-w-none print:p-0">
      <nav aria-label="Invoice preview" className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href={back.href}
          className="group -ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm font-semibold text-interactive transition-colors hover:text-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
        >
          <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" aria-hidden="true" />
          {back.label}
        </Link>
        <PrintButton />
      </nav>
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
