import 'server-only'
import type Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { OnlineMethod, OnlineSession, PaymentAccountStatus } from '@/lib/online-payments'

/** Contractors: NAICS "General contractors – residential" (Stripe merchant category 1520). */
const CONTRACTOR_MCC = '1520'

export class PaymentsError extends Error {}

function stripeOrThrow(): Stripe {
  const stripe = getStripe()
  if (!stripe) throw new PaymentsError('Online payments are not set up on this server yet.')
  return stripe
}

const ACCOUNT_COLUMNS =
  'stripe_account_id, livemode, details_submitted, charges_enabled, payouts_enabled, accept_card, accept_ach, requirements_due'

/** As the signed-in manager (RLS). */
export async function getPaymentAccount(organizationId: string): Promise<PaymentAccountStatus | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('organization_payment_accounts').select(ACCOUNT_COLUMNS).eq('organization_id', organizationId).maybeSingle()
  return (data as PaymentAccountStatus | null) ?? null
}

/** Server-side read for homeowner pages, which can't see the builder's account row. */
export async function getPaymentAccountForPortal(organizationId: string): Promise<PaymentAccountStatus | null> {
  const { data } = await createAdminClient().from('organization_payment_accounts').select(ACCOUNT_COLUMNS).eq('organization_id', organizationId).maybeSingle()
  return (data as PaymentAccountStatus | null) ?? null
}

function statusFrom(account: Stripe.Account) {
  return {
    livemode: Boolean((account as unknown as { livemode?: boolean }).livemode ?? !String(process.env.STRIPE_SECRET_KEY).includes('_test_')),
    details_submitted: Boolean(account.details_submitted),
    charges_enabled: Boolean(account.charges_enabled),
    payouts_enabled: Boolean(account.payouts_enabled),
    requirements_due: [...(account.requirements?.currently_due ?? []), ...(account.requirements?.past_due ?? [])].slice(0, 30),
    updated_at: new Date().toISOString(),
  }
}

/** Pulls the latest status from Stripe (after onboarding, or when the settings page opens). */
export async function refreshPaymentAccount(organizationId: string): Promise<PaymentAccountStatus | null> {
  const admin = createAdminClient()
  const { data } = await admin.from('organization_payment_accounts').select('stripe_account_id').eq('organization_id', organizationId).maybeSingle()
  if (!data) return null
  const stripe = getStripe()
  if (!stripe) return getPaymentAccountForPortal(organizationId)
  try {
    const account = await stripe.accounts.retrieve(data.stripe_account_id)
    await admin.from('organization_payment_accounts').update(statusFrom(account)).eq('organization_id', organizationId)
  } catch (error) {
    console.error('[payments] account refresh failed', { organizationId, message: error instanceof Error ? error.message : String(error) })
  }
  return getPaymentAccountForPortal(organizationId)
}

/** Webhook: account.updated from Stripe Connect. */
export async function applyAccountUpdate(account: Stripe.Account) {
  await createAdminClient().from('organization_payment_accounts').update(statusFrom(account)).eq('stripe_account_id', account.id)
}

/** Creates the builder's Stripe account if needed and returns Stripe's onboarding page. */
export async function startOnboarding(opts: { organizationId: string; userId: string; origin: string }): Promise<string> {
  const stripe = stripeOrThrow()
  const admin = createAdminClient()
  let { data: row } = await admin.from('organization_payment_accounts').select('stripe_account_id').eq('organization_id', opts.organizationId).maybeSingle()

  if (!row) {
    const { data: org } = await admin.from('organizations').select('display_name, email, website, phone').eq('id', opts.organizationId).single()
    const account = await stripe.accounts.create(
      {
        type: 'express',
        country: 'US',
        email: org?.email ?? undefined,
        business_profile: {
          name: org?.display_name ?? undefined,
          mcc: CONTRACTOR_MCC,
          url: org?.website || undefined,
          product_description: 'Residential construction and remodeling services invoiced through Trefort.',
        },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
          us_bank_account_ach_payments: { requested: true },
        },
        metadata: { organization_id: opts.organizationId },
      },
      { idempotencyKey: `trefort-connect-${opts.organizationId}` },
    )
    const { error } = await admin.from('organization_payment_accounts').insert({
      organization_id: opts.organizationId,
      stripe_account_id: account.id,
      created_by: opts.userId,
      ...statusFrom(account),
    })
    if (error && error.code !== '23505') throw new PaymentsError('Your Stripe account could not be saved. Try again.')
    row = { stripe_account_id: account.id }
  }

  const link = await stripe.accountLinks.create({
    account: row.stripe_account_id,
    type: 'account_onboarding',
    refresh_url: `${opts.origin}/api/payments/onboarding?refresh=1`,
    return_url: `${opts.origin}/settings/integrations?payments=returned`,
  })
  return link.url
}

/** One-time link to the builder's Stripe Express dashboard (payouts, refunds, disputes). */
export async function dashboardLink(organizationId: string): Promise<string> {
  const stripe = stripeOrThrow()
  const account = await getPaymentAccountForPortal(organizationId)
  if (!account) throw new PaymentsError('Set up payments first.')
  const link = await stripe.accounts.createLoginLink(account.stripe_account_id)
  return link.url
}

export async function setAcceptedMethods(organizationId: string, card: boolean, ach: boolean) {
  if (!card && !ach) throw new PaymentsError('Keep at least one way to pay turned on.')
  const { error } = await createAdminClient()
    .from('organization_payment_accounts')
    .update({ accept_card: card, accept_ach: ach, updated_at: new Date().toISOString() })
    .eq('organization_id', organizationId)
  if (error) throw new PaymentsError('Your choices could not be saved.')
}

export async function listInvoiceSessions(invoiceId: string): Promise<OnlineSession[]> {
  const { data } = await createAdminClient()
    .from('online_payment_sessions')
    .select('id, invoice_id, method, amount_cents, status, failure_message, created_at, completed_at')
    .eq('invoice_id', invoiceId)
    .order('created_at', { ascending: false })
    .limit(50)
  return (data ?? []).map((s) => ({ ...s, amount_cents: Number(s.amount_cents) })) as OnlineSession[]
}

/**
 * Starts a Stripe Checkout page for an invoice's remaining balance, charged directly on the builder's account
 * (the builder is the merchant and pays Stripe's fees). Earlier unfinished checkouts for the invoice are closed.
 */
export async function createInvoiceCheckout(opts: {
  invoice: { id: string; organization_id: string; project_id: string; invoice_number: string; title: string | null; balance_cents: number }
  projectName: string | null
  companyName: string
  method: OnlineMethod
  email: string | null
  userId: string
  origin: string
}): Promise<string> {
  const stripe = stripeOrThrow()
  const account = await getPaymentAccountForPortal(opts.invoice.organization_id)
  if (!account?.charges_enabled) throw new PaymentsError('Online payment isn’t available for this invoice.')
  const admin = createAdminClient()

  const { data: stale } = await admin
    .from('online_payment_sessions')
    .select('id, stripe_checkout_session_id')
    .eq('invoice_id', opts.invoice.id)
    .eq('status', 'open')
  for (const s of stale ?? []) {
    if (s.stripe_checkout_session_id) {
      await stripe.checkout.sessions.expire(s.stripe_checkout_session_id, {}, { stripeAccount: account.stripe_account_id }).catch(() => undefined)
    }
    await admin.from('online_payment_sessions').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('id', s.id)
  }

  const { data: row, error } = await admin
    .from('online_payment_sessions')
    .insert({
      organization_id: opts.invoice.organization_id,
      invoice_id: opts.invoice.id,
      project_id: opts.invoice.project_id,
      stripe_account_id: account.stripe_account_id,
      method: opts.method,
      amount_cents: opts.invoice.balance_cents,
      started_by: opts.userId,
    })
    .select('id')
    .single()
  if (error || !row) throw new PaymentsError('The payment page could not be opened. Try again.')

  const metadata = { trefort_session_id: row.id, invoice_id: opts.invoice.id, organization_id: opts.invoice.organization_id }
  const feeBps = Math.max(0, Math.min(500, Number(process.env.PAYMENTS_PLATFORM_FEE_BPS ?? 0) || 0))
  const description = `${opts.companyName} · Invoice ${opts.invoice.invoice_number}${opts.projectName ? ` · ${opts.projectName}` : ''}`

  const checkout = await stripe.checkout.sessions.create(
    {
      mode: 'payment',
      client_reference_id: row.id,
      customer_email: opts.email ?? undefined,
      allowed_payment_method_types: [opts.method === 'card' ? 'card' : 'us_bank_account'],
      ...(opts.method === 'ach'
        ? { payment_method_options: { us_bank_account: { verification_method: 'automatic' as const } } }
        : {}),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: opts.invoice.balance_cents,
            product_data: {
              name: `Invoice ${opts.invoice.invoice_number}`,
              description: (opts.invoice.title || opts.projectName || opts.companyName).slice(0, 300),
            },
          },
        },
      ],
      payment_intent_data: {
        description: description.slice(0, 1000),
        metadata,
        ...(feeBps ? { application_fee_amount: Math.round((opts.invoice.balance_cents * feeBps) / 10000) } : {}),
      },
      metadata,
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
      success_url: `${opts.origin}/portal/invoices/${opts.invoice.id}?payment=success`,
      cancel_url: `${opts.origin}/portal/invoices/${opts.invoice.id}?payment=cancelled`,
    },
    { stripeAccount: account.stripe_account_id, idempotencyKey: `trefort-checkout-${row.id}` },
  )
  await admin.from('online_payment_sessions').update({ stripe_checkout_session_id: checkout.id, updated_at: new Date().toISOString() }).eq('id', row.id)
  if (!checkout.url) throw new PaymentsError('Stripe did not return a payment page. Try again.')
  return checkout.url
}

const intentId = (pi: string | Stripe.PaymentIntent | null) => (pi ? (typeof pi === 'string' ? pi : pi.id) : null)

/** Webhook handler for Checkout events on a builder's account. Returns the organization id for the ledger. */
export async function applyCheckoutEvent(type: string, session: Stripe.Checkout.Session): Promise<string | null> {
  const sessionRow = session.metadata?.trefort_session_id
  if (!sessionRow || session.mode !== 'payment') return null
  const admin = createAdminClient()
  const { data: row } = await admin.from('online_payment_sessions').select('id, organization_id, status').eq('id', sessionRow).maybeSingle()
  if (!row) return null
  const pi = intentId(session.payment_intent)
  const now = new Date().toISOString()

  if ((type === 'checkout.session.completed' && session.payment_status === 'paid') || type === 'checkout.session.async_payment_succeeded') {
    if (!pi) throw new Error('Paid checkout without a payment intent')
    const { error } = await admin.rpc('record_online_invoice_payment', { p_session: row.id, p_payment_intent: pi })
    if (error) throw new Error(`record_online_invoice_payment failed: ${error.message}`)
  } else if (type === 'checkout.session.completed') {
    // Bank transfers: the homeowner authorised the debit; the money clears in a few days.
    if (row.status === 'open') {
      await admin.from('online_payment_sessions').update({ status: 'processing', stripe_payment_intent_id: pi, updated_at: now }).eq('id', row.id)
    }
  } else if (type === 'checkout.session.async_payment_failed') {
    await admin
      .from('online_payment_sessions')
      .update({ status: 'failed', stripe_payment_intent_id: pi, failure_message: 'The bank transfer did not go through.', completed_at: now, updated_at: now })
      .eq('id', row.id)
      .in('status', ['open', 'processing'])
  } else if (type === 'checkout.session.expired') {
    await admin.from('online_payment_sessions').update({ status: 'expired', updated_at: now }).eq('id', row.id).eq('status', 'open')
  }
  return row.organization_id as string
}

/** Webhook: a full refund issued in the builder's Stripe dashboard reverses the payment on the invoice. */
export async function applyRefund(charge: Stripe.Charge): Promise<void> {
  const pi = intentId(charge.payment_intent)
  if (!pi || !charge.refunded) return
  const { error } = await createAdminClient().rpc('reverse_online_invoice_payment', { p_payment_intent: pi, p_reason: 'Refunded in Stripe' })
  if (error) throw new Error(`reverse_online_invoice_payment failed: ${error.message}`)
}
