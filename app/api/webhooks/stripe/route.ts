import type Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { syncSubscription } from '@/lib/stripe-sync'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SUBSCRIPTION_EVENTS = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
])

/**
 * Stripe → Trefort. Verifies the signature, applies each event once (stripe_events ledger) and keeps the company's
 * plan and status in step with Stripe. Any error returns 500 so Stripe retries.
 */
export async function POST(request: Request) {
  const stripe = getStripe()
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!stripe || !secret) return new Response('Billing is not configured', { status: 503 })

  const signature = request.headers.get('stripe-signature')
  if (!signature) return new Response('Missing signature', { status: 400 })
  const body = await request.text()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret)
  } catch {
    return new Response('Invalid signature', { status: 400 })
  }

  const admin = createAdminClient()
  const { data: seen } = await admin.from('stripe_events').select('id').eq('id', event.id).maybeSingle()
  if (seen) return Response.json({ received: true, duplicate: true })

  let organizationId: string | null = null
  try {
    if (SUBSCRIPTION_EVENTS.has(event.type)) {
      organizationId = await syncSubscription(event.data.object as Stripe.Subscription)
    } else if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      if (session.mode === 'subscription' && session.subscription) {
        const id = typeof session.subscription === 'string' ? session.subscription : session.subscription.id
        organizationId = await syncSubscription(await stripe.subscriptions.retrieve(id))
      }
    } else if (event.type === 'invoice.payment_failed' || event.type === 'invoice.paid') {
      const invoice = event.data.object as Stripe.Invoice
      const sub = invoice.parent?.subscription_details?.subscription
      if (sub) {
        const id = typeof sub === 'string' ? sub : sub.id
        organizationId = await syncSubscription(await stripe.subscriptions.retrieve(id))
      }
    } else {
      return Response.json({ received: true, ignored: true })
    }
  } catch (error) {
    console.error('[stripe-webhook] failed to apply', event.type, event.id, error)
    return new Response('Could not apply event', { status: 500 })
  }

  await admin.from('stripe_events').insert({ id: event.id, type: event.type, organization_id: organizationId })
  return Response.json({ received: true })
}
