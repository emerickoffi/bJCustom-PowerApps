import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, CreditCard, TriangleAlert } from 'lucide-react'
import { requireStaff } from '@/lib/session'
import { getOrgBilling, getPublicPlans } from '@/lib/billing'
import { billingAccess, trialDaysLeft } from '@/lib/billing-shared'
import { getStripe, stripeMode } from '@/lib/stripe'
import { syncSubscription } from '@/lib/stripe-sync'
import { formatDate } from '@/lib/format'
import { TrefortLogo } from '@/components/brand/trefort-logo'
import { PlanChooser } from '@/components/billing/plan-chooser'
import { ManageBillingButton } from '@/components/billing/manage-billing-button'

export const metadata: Metadata = { title: 'Billing', robots: { index: false, follow: false } }

const STATUS_LABELS: Record<string, string> = {
  internal: 'Internal (never billed)',
  trialing: 'Free trial',
  active: 'Active',
  past_due: 'Payment failed, retrying',
  unpaid: 'Unpaid',
  canceled: 'Canceled',
  incomplete: 'Waiting for first payment',
  incomplete_expired: 'Checkout not completed',
  paused: 'Paused',
}

/** After Stripe Checkout returns, apply the new subscription right away instead of waiting for the webhook. */
async function applyCheckout(checkoutId: string, organizationId: string): Promise<boolean> {
  const stripe = getStripe()
  if (!stripe || !checkoutId.startsWith('cs_')) return false
  try {
    const checkout = await stripe.checkout.sessions.retrieve(checkoutId)
    if (checkout.client_reference_id !== organizationId || !checkout.subscription) return false
    const id = typeof checkout.subscription === 'string' ? checkout.subscription : checkout.subscription.id
    await syncSubscription(await stripe.subscriptions.retrieve(id))
    return true
  } catch (error) {
    console.error('[billing] could not apply checkout', error)
    return false
  }
}

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const session = await requireStaff()
  const { checkout } = await searchParams
  const isAdmin = session.role === 'org_admin'
  const justPaid = isAdmin && checkout && checkout !== 'cancelled' ? await applyCheckout(checkout, session.organizationId) : false

  const [billing, plans] = await Promise.all([getOrgBilling(session.organizationId), getPublicPlans()])
  const access = billing ? billingAccess(billing) : { state: 'ok' as const, reason: null }
  const blocked = access.state === 'blocked'
  const companyName = session.workspaces.find((w) => w.organizationId === session.organizationId)?.organizationName ?? 'Your company'
  const mode = stripeMode()
  const plan = plans.find((p) => p.key === billing?.plan_key)
  const days = billing?.subscription_status === 'trialing' ? trialDaysLeft(billing.trial_ends_at) : null

  return (
    <div className="min-h-svh bg-background">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="w-28 rounded-md bg-[#00788d] px-2.5 py-1.5">
            <TrefortLogo />
          </div>
          {!blocked && (
            <Link href="/dashboard" className="flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline">
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back to dashboard
            </Link>
          )}
          {blocked && (
            <form action="/auth/sign-out" method="post">
              <button type="submit" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                Sign out
              </button>
            </form>
          )}
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-foreground">Billing</h1>
          <p className="text-sm text-muted-foreground">{companyName}</p>
        </div>

        {mode === 'test' && (
          <p className="rounded-panel border border-accent-blue/30 bg-accent-blue-soft px-4 py-2 text-sm text-foreground">
            Test mode: no real money moves. Use card 4242 4242 4242 4242 with any future date and any CVC.
          </p>
        )}
        {justPaid && (
          <p role="status" className="rounded-panel border border-primary/30 bg-primary/5 px-4 py-3 text-sm font-medium text-foreground">
            Thank you! Your subscription is active.
          </p>
        )}
        {checkout === 'cancelled' && (
          <p role="status" className="rounded-panel border border-border bg-muted/40 px-4 py-3 text-sm text-foreground">
            Checkout was cancelled. Nothing was charged.
          </p>
        )}
        {access.reason && !justPaid && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-panel border border-champagne/40 bg-champagne-soft px-4 py-3 text-sm font-medium text-champagne-foreground"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {access.reason}
            {blocked && !isAdmin && ' Ask your company administrator to update billing. Your projects and records are safe.'}
          </p>
        )}

        {billing && (
          <section aria-label="Current plan" className="surface flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <CreditCard className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
              <div className="flex flex-col gap-0.5 text-sm">
                <p className="font-medium text-foreground">
                  {`${plan?.name ?? (billing.plan_key === 'internal' ? 'Internal' : billing.plan_key)} plan · ${STATUS_LABELS[billing.subscription_status] ?? billing.subscription_status}`}
                </p>
                <p className="text-muted-foreground">
                  {days !== null && billing.trial_ends_at
                    ? `${days} day${days === 1 ? '' : 's'} left in your free trial (ends ${formatDate(billing.trial_ends_at)}).`
                    : billing.current_period_end
                      ? billing.cancel_at_period_end
                        ? `Ends on ${formatDate(billing.current_period_end)}. You can resume it before then.`
                        : `Renews on ${formatDate(billing.current_period_end)}, billed ${billing.billing_interval === 'year' ? 'yearly' : 'monthly'}.`
                      : billing.subscription_status === 'internal'
                        ? 'Every module is included and this company is never billed.'
                        : 'No payment method on file yet.'}
                </p>
              </div>
            </div>
            {isAdmin && billing.has_subscription && (
              <div data-store-hidden>
                <ManageBillingButton />
              </div>
            )}
          </section>
        )}

        {isAdmin && billing && billing.subscription_status !== 'internal' && plans.length > 0 && (
          <p data-store-only className="text-sm text-muted-foreground">
            To choose or change your plan, sign in to Trefort in a web browser on your computer.
          </p>
        )}

        {isAdmin && billing && billing.subscription_status !== 'internal' && plans.length > 0 && (
          // App Store rules: no purchase buttons inside the iPhone app. Hidden there by CSS (see globals.css).
          <section data-store-hidden aria-labelledby="plans-heading" className="flex flex-col gap-4">
            <h2 id="plans-heading" className="text-lg font-semibold text-foreground">
              {billing.has_subscription && !blocked ? 'Change plan' : 'Choose a plan'}
            </h2>
            <PlanChooser
              plans={plans}
              currentPlan={billing.plan_key}
              currentInterval={billing.billing_interval}
              subscribed={billing.has_subscription && !['canceled', 'incomplete_expired'].includes(billing.subscription_status)}
              disabled={!getStripe()}
            />
            {!getStripe() && (
              <p className="text-sm text-muted-foreground">Online billing is not connected yet. Contact Trefort to change your plan.</p>
            )}
            <p className="text-xs text-muted-foreground">
              Prices in US dollars, before any applicable tax. Cancel anytime; you keep access until the end of the period you paid for.
            </p>
          </section>
        )}

        {!isAdmin && !blocked && (
          <p className="text-sm text-muted-foreground">Only company administrators can change the plan or billing details.</p>
        )}
      </main>
    </div>
  )
}
