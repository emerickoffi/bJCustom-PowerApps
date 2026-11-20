import type { Metadata } from 'next'
import Link from 'next/link'
import { Plug } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { requireAdmin } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { getQuickBooksConnection, getQuickBooksStatus, quickBooksEnvironment } from '@/lib/quickbooks'
import { formatDate } from '@/lib/format'
import { PageHeader, pageLayout } from '@/components/shared/page-header'
import { QuickBooksDisconnectButton, QuickBooksSyncAllButton } from '@/components/integrations/quickbooks-buttons'
import { AcceptedMethods, StripeDashboardButton } from '@/components/integrations/payments-controls'
import { refreshPaymentAccount } from '@/lib/stripe-connect'
import { accountSetupState } from '@/lib/online-payments'
import { getStripe } from '@/lib/stripe'

export const metadata: Metadata = { title: 'Integrations' }

const RESULT_MESSAGES: Record<string, { tone: 'ok' | 'warn'; text: string }> = {
  connected: { tone: 'ok', text: 'QuickBooks is connected.' },
  cancelled: { tone: 'warn', text: 'QuickBooks connection was cancelled.' },
  expired: { tone: 'warn', text: 'That connection attempt expired. Start again.' },
  failed: { tone: 'warn', text: 'QuickBooks could not be connected. Try again, and contact support if it keeps happening.' },
  plan: { tone: 'warn', text: 'QuickBooks is part of the Business plan. Upgrade in Settings → Billing to connect it.' },
  not_configured: { tone: 'warn', text: 'QuickBooks API credentials are not set up yet.' },
}

const PAYMENT_MESSAGES: Record<string, { tone: 'ok' | 'warn'; text: string }> = {
  returned: { tone: 'ok', text: 'Thanks. Stripe is reviewing your details; this page shows when payments are ready.' },
  plan: { tone: 'warn', text: 'Online payments are part of the Business plan. Upgrade in Settings → Billing to set them up.' },
  not_configured: { tone: 'warn', text: 'Stripe is not set up on this server yet.' },
  failed: { tone: 'warn', text: 'Payments could not be set up. Try again.' },
  stripe_error: { tone: 'warn', text: 'Stripe could not be reached. Try again in a minute.' },
}

const SETUP_LABELS = {
  not_started: 'Not set up',
  incomplete: 'Finish setup',
  pending: 'Stripe is reviewing',
  ready: 'Accepting payments',
} as const

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<{ qbo?: string; payments?: string }> }) {
  const session = await requireAdmin()
  const [features, connection, { qbo, payments: paymentsResult }, paymentAccount] = await Promise.all([
    getOrgFeatures(session.organizationId),
    getQuickBooksConnection(session.organizationId),
    searchParams,
    refreshPaymentAccount(session.organizationId),
  ])
  const status = getQuickBooksStatus(Boolean(connection))
  const result = qbo ? RESULT_MESSAGES[qbo] : paymentsResult ? PAYMENT_MESSAGES[paymentsResult] : undefined
  const paymentSetup = accountSetupState(paymentAccount)
  const stripeReady = Boolean(getStripe())
  const needsReauth = connection?.status === 'needs_reauth'
  const sandbox = (connection?.environment ?? quickBooksEnvironment()) === 'sandbox'

  return (
    <div className={pageLayout('form', 'max-w-5xl')}>
      <PageHeader icon={Plug} level={2} title="Integrations" />

      {result && (
        <p
          role="status"
          className={`rounded-xl px-4 py-3 text-sm ${result.tone === 'ok' ? 'bg-sage/60 text-foreground' : 'bg-champagne-soft text-foreground'}`}
        >
          {result.text}
        </p>
      )}

      <section aria-labelledby="qbo-heading" className="surface flex flex-col gap-5 p-5 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 flex-col gap-1.5">
            <h2 id="qbo-heading" className="type-section-title text-foreground">
              QuickBooks Online
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Send issued invoices and the payments you record to QuickBooks, so your books match what you billed.
              Customers are created or matched by name.
            </p>
          </div>
          <span className="w-fit shrink-0 rounded-badge bg-champagne-soft px-2.5 py-1 text-xs font-medium text-warning">
            {needsReauth ? 'Reconnect needed' : connection ? 'Connected' : status.credentialsConfigured ? 'Not connected' : 'Setup required'}
          </span>
        </div>

        <dl className="grid gap-3 border-t pt-5 text-sm md:grid-cols-3">
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground">QuickBooks company</dt>
            <dd className="font-medium text-foreground">
              {connection ? (connection.company_name ?? `Company ${connection.realm_id}`) : 'Not connected'}
              {connection && sandbox ? ' (test company)' : ''}
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground">Last sync</dt>
            <dd className="font-medium text-foreground">{connection?.last_synced_at ? formatDate(connection.last_synced_at) : 'Never'}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground">Module</dt>
            <dd className="font-medium text-foreground">{features.quickbooks ? 'On' : 'Off'}</dd>
          </div>
        </dl>

        {connection?.last_error && (
          <p className="rounded-xl bg-champagne-soft px-4 py-3 text-sm text-foreground">{connection.last_error}</p>
        )}

        <div className="flex flex-col gap-2 rounded-xl bg-sage/50 p-4 text-sm leading-relaxed text-foreground">
          <p>What goes to QuickBooks: issued invoices (not drafts), their payments, voids and reversed payments.</p>
          <p className="text-muted-foreground">
            Invoices with sales tax are skipped for now, so QuickBooks’ own tax settings apply. Enter those directly in QuickBooks.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {!status.credentialsConfigured ? (
            <p className="text-sm text-muted-foreground">Available once Intuit API credentials are added to the server.</p>
          ) : !connection || needsReauth ? (
            <Link href="/api/integrations/quickbooks/connect" prefetch={false} className={buttonVariants()}>
              {needsReauth ? 'Reconnect QuickBooks' : 'Connect QuickBooks'}
            </Link>
          ) : (
            <>
              <QuickBooksSyncAllButton />
              <QuickBooksDisconnectButton />
            </>
          )}
        </div>
      </section>

      <section aria-labelledby="payments-heading" className="surface flex flex-col gap-5 p-5 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 flex-col gap-1.5">
            <h2 id="payments-heading" className="type-section-title text-foreground">
              Online payments
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Homeowners pay their invoices by card or bank transfer from their portal. The money goes straight to your own
              Stripe account and the payment is recorded on the invoice automatically. Stripe&apos;s processing fees come out of
              each payment; Trefort takes nothing extra.
            </p>
          </div>
          <span className="w-fit shrink-0 rounded-badge bg-champagne-soft px-2.5 py-1 text-xs font-medium text-warning">
            {SETUP_LABELS[paymentSetup]}
          </span>
        </div>

        {paymentAccount && !paymentAccount.livemode && (
          <p className="rounded-xl bg-sage/50 px-4 py-3 text-sm text-foreground">
            Test mode: no real money moves. Use Stripe&apos;s test card 4242 4242 4242 4242 to try a payment.
          </p>
        )}

        {paymentSetup === 'ready' && paymentAccount ? (
          <>
            <AcceptedMethods card={paymentAccount.accept_card} ach={paymentAccount.accept_ach} />
            {!features.payments && (
              <p className="text-sm text-muted-foreground">
                The Online payments module is off, so homeowners don&apos;t see Pay now. Turn it on in Feature management.
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <StripeDashboardButton />
            </div>
          </>
        ) : !stripeReady ? (
          <p className="text-sm text-muted-foreground">Available once Stripe is set up on the server.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {paymentSetup === 'incomplete' && paymentAccount?.details_submitted && (
              <p className="text-sm text-muted-foreground">Stripe needs a few more details before you can accept payments.</p>
            )}
            {paymentSetup === 'pending' && (
              <p className="text-sm text-muted-foreground">Stripe is checking your details. This usually takes a few minutes, sometimes a day or two.</p>
            )}
            <div>
              <Link href="/api/payments/onboarding" prefetch={false} className={buttonVariants()}>
                {paymentSetup === 'not_started' ? 'Set up payments with Stripe' : 'Continue in Stripe'}
              </Link>
            </div>
            <p className="text-xs text-muted-foreground">
              Stripe asks for your business details, a bank account for payouts and the owner&apos;s identity. It takes about 10 minutes.
            </p>
          </div>
        )}
      </section>
    </div>
  )
}
