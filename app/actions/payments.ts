'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getSession, requireAdmin } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { getInvoice } from '@/lib/invoice-queries'
import { createClient } from '@/lib/supabase/server'
import { requestOrigin } from '@/lib/invitations'
import { decidePayment } from '@/lib/online-payments'
import { PaymentsError, createInvoiceCheckout, dashboardLink, getPaymentAccountForPortal, listInvoiceSessions, setAcceptedMethods } from '@/lib/stripe-connect'

type Result = { ok: true; url?: string; message?: string } | { ok: false; error: string }

const fail = (error: unknown, fallback: string): Result => {
  if (error instanceof PaymentsError) return { ok: false, error: error.message }
  console.error('[payments]', error instanceof Error ? error.message : error)
  return { ok: false, error: fallback }
}

export async function openPaymentsDashboardAction(): Promise<Result> {
  const session = await requireAdmin()
  try {
    return { ok: true, url: await dashboardLink(session.organizationId) }
  } catch (error) {
    return fail(error, 'Stripe could not be opened. Try again.')
  }
}

export async function setAcceptedMethodsAction(input: { card: boolean; ach: boolean }): Promise<Result> {
  const session = await requireAdmin()
  const parsed = z.object({ card: z.boolean(), ach: z.boolean() }).safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Choose how homeowners can pay.' }
  try {
    await setAcceptedMethods(session.organizationId, parsed.data.card, parsed.data.ach)
  } catch (error) {
    return fail(error, 'Your choices could not be saved.')
  }
  revalidatePath('/settings/integrations')
  return { ok: true, message: 'Saved.' }
}

/** Homeowner (or anyone who can see the invoice) starts paying its remaining balance. */
export async function payInvoiceOnlineAction(input: { invoiceId: string; method: 'card' | 'ach' }): Promise<Result> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'Sign in again to pay this invoice.' }
  const parsed = z.object({ invoiceId: z.string().uuid(), method: z.enum(['card', 'ach']) }).safeParse(input)
  if (!parsed.success) return { ok: false, error: 'This page is out of date. Reload and try again.' }

  const data = await getInvoice(parsed.data.invoiceId) // RLS: only people who can see this invoice
  if (!data || data.invoice.status === 'draft') return { ok: false, error: 'Invoice not found.' }
  const inv = data.invoice
  const [features, account, sessions] = await Promise.all([
    getOrgFeatures(inv.organization_id),
    getPaymentAccountForPortal(inv.organization_id),
    listInvoiceSessions(inv.id),
  ])
  const decision = decidePayment({ featureOn: Boolean(features.payments), account, invoice: inv, sessions })
  if (!decision.canPay) return { ok: false, error: decision.message || 'Online payment isn’t available for this invoice.' }
  if (!decision.methods.includes(parsed.data.method)) return { ok: false, error: 'That way to pay isn’t available for this invoice.' }

  const supabase = await createClient()
  const { data: project } = await supabase.from('projects').select('name').eq('id', inv.project_id).maybeSingle()
  try {
    const url = await createInvoiceCheckout({
      invoice: {
        id: inv.id,
        organization_id: inv.organization_id,
        project_id: inv.project_id,
        invoice_number: inv.invoice_number,
        title: inv.title,
        balance_cents: decision.balanceCents,
      },
      projectName: (project?.name as string | undefined) ?? null,
      companyName: session.brand.displayName,
      method: parsed.data.method,
      email: session.email ?? null,
      userId: session.userId,
      origin: await requestOrigin(),
    })
    return { ok: true, url }
  } catch (error) {
    return fail(error, 'The payment page could not be opened. Nothing was charged. Try again.')
  }
}
