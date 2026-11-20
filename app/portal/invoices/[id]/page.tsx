import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Printer } from 'lucide-react'
import { getSession } from '@/lib/session'
import { getInvoice } from '@/lib/invoice-queries'
import { Button } from '@/components/ui/button'
import { InvoiceDocument } from '@/components/invoices/invoice-document'
import { PayOnline } from '@/components/invoices/pay-online'
import { getOrgFeatures } from '@/lib/features'
import { decidePayment } from '@/lib/online-payments'
import { getPaymentAccountForPortal, listInvoiceSessions } from '@/lib/stripe-connect'

export const metadata: Metadata = { title: 'Invoice' }

export default async function PortalInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ payment?: string }>
}) {
  const { id } = await params
  const { payment } = await searchParams
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const session = await getSession()
  if (!session) redirect(`/auth/login?next=${encodeURIComponent(`/portal/invoices/${id}`)}`)
  const data = await getInvoice(id)
  if (!data || data.invoice.status === 'draft') notFound()
  const inv = data.invoice
  const [features, account, sessions] = await Promise.all([
    getOrgFeatures(inv.organization_id),
    getPaymentAccountForPortal(inv.organization_id),
    listInvoiceSessions(inv.id),
  ])
  const decision = decidePayment({ featureOn: Boolean(features.payments), account, invoice: inv, sessions })
  const offered = decision.canPay || decision.reason === 'processing' || decision.reason === 'review'
  const justPaid = payment === 'success' && inv.status !== 'paid'

  return (
    <div className="flex w-full min-w-0 flex-col gap-5 md:gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/portal/invoices" className="text-sm text-muted-foreground hover:text-primary">
          All invoices
        </Link>
        <Button variant="outline" render={<Link href={`/invoices/${id}/print`} target="_blank" />} nativeButton={false}>
          <Printer data-icon="inline-start" />
          Print / PDF
        </Button>
      </div>
      {payment === 'success' && (
        <p role="status" className="rounded-xl bg-sage px-4 py-3 text-sm text-foreground">
          {inv.status === 'paid'
            ? 'Thank you. Your payment was received and this invoice is paid.'
            : justPaid && !decision.canPay
              ? 'Thank you. Your payment is on its way; it shows here once it clears.'
              : 'Thank you. Stripe is confirming your payment; refresh this page in a moment.'}
        </p>
      )}
      {payment === 'cancelled' && (
        <p role="status" className="rounded-xl bg-champagne-soft px-4 py-3 text-sm text-foreground">
          Payment cancelled. Nothing was charged.
        </p>
      )}
      {decision.canPay ? (
        <PayOnline invoiceId={inv.id} balanceCents={decision.balanceCents} methods={decision.methods} companyName={session.brand.displayName} />
      ) : (
        decision.message && (
          <p role="status" className="rounded-xl bg-sage/60 px-4 py-3 text-sm text-foreground">
            {decision.message}
          </p>
        )
      )}
      <InvoiceDocument invoice={data.invoice} lines={data.lines} payments={data.payments} companyName={session.brand.displayName} />
      <p className="text-sm text-muted-foreground">
        Questions about this invoice? Contact your project manager.
        {!offered && inv.status !== 'paid' && inv.status !== 'voided' && ' Please follow the payment instructions above.'}
      </p>
    </div>
  )
}
