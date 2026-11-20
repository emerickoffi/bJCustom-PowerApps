/**
 * Online invoice payments: pure rules shared by the portal, the builder's settings and the Stripe webhook.
 */

export type OnlineMethod = 'card' | 'ach'

export type PaymentAccountStatus = {
  stripe_account_id: string
  livemode: boolean
  details_submitted: boolean
  charges_enabled: boolean
  payouts_enabled: boolean
  accept_card: boolean
  accept_ach: boolean
  requirements_due: string[]
}

export type OnlineSessionStatus = 'open' | 'processing' | 'succeeded' | 'failed' | 'expired' | 'needs_review'

export type OnlineSession = {
  id: string
  invoice_id: string
  method: OnlineMethod
  amount_cents: number
  status: OnlineSessionStatus
  failure_message: string | null
  created_at: string
  completed_at: string | null
}

/** Stripe's standard US pricing, used only to show the builder an estimate. Stripe's statement is authoritative. */
export function estimateProcessingFeeCents(method: OnlineMethod, amountCents: number): number {
  if (method === 'card') return Math.round(amountCents * 0.029) + 30
  return Math.min(Math.round(amountCents * 0.008), 500)
}

/** Card checkout is capped by Stripe at $999,999.99; bank transfers go higher but large amounts are reviewed. */
export const CARD_MAX_CENTS = 99_999_999

export type PayDecision =
  | { canPay: true; balanceCents: number; methods: OnlineMethod[] }
  | { canPay: false; reason: 'not_offered' | 'not_ready' | 'nothing_due' | 'processing' | 'review'; message: string }

/** Whether a homeowner sees "Pay now" for an invoice, and with which methods. */
export function decidePayment(opts: {
  featureOn: boolean
  account: Pick<PaymentAccountStatus, 'charges_enabled' | 'accept_card' | 'accept_ach'> | null
  invoice: { status: string; total_cents: number; paid_cents: number }
  sessions: Pick<OnlineSession, 'status' | 'amount_cents'>[]
}): PayDecision {
  if (!opts.featureOn || !opts.account) return { canPay: false, reason: 'not_offered', message: '' }
  if (!opts.account.charges_enabled) return { canPay: false, reason: 'not_ready', message: '' }
  const balance = Number(opts.invoice.total_cents) - Number(opts.invoice.paid_cents)
  if (!['issued', 'partially_paid'].includes(opts.invoice.status) || balance <= 0) {
    return { canPay: false, reason: 'nothing_due', message: '' }
  }
  if (opts.sessions.some((s) => s.status === 'processing')) {
    return { canPay: false, reason: 'processing', message: 'Your bank payment is processing. Bank transfers usually take 3–5 business days to clear.' }
  }
  if (opts.sessions.some((s) => s.status === 'needs_review')) {
    return { canPay: false, reason: 'review', message: 'Your payment was received and your builder is applying it to this invoice.' }
  }
  const methods: OnlineMethod[] = []
  if (opts.account.accept_card && balance <= CARD_MAX_CENTS) methods.push('card')
  if (opts.account.accept_ach) methods.push('ach')
  if (!methods.length) return { canPay: false, reason: 'not_offered', message: '' }
  return { canPay: true, balanceCents: balance, methods }
}

export const ONLINE_METHOD_LABELS: Record<OnlineMethod, string> = {
  card: 'Card',
  ach: 'Bank transfer (ACH)',
}

/** What the builder still has to do in Stripe, in plain words. */
export function accountSetupState(a: PaymentAccountStatus | null): 'not_started' | 'incomplete' | 'pending' | 'ready' {
  if (!a) return 'not_started'
  if (a.charges_enabled) return 'ready'
  if (!a.details_submitted || a.requirements_due.length) return 'incomplete'
  return 'pending'
}
