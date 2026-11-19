'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdmin, requireManager } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { disconnectQuickBooks } from '@/lib/quickbooks'
import { syncAllInvoicesToQuickBooks, syncInvoiceToQuickBooks, type SyncResult } from '@/lib/quickbooks-sync'

export async function disconnectQuickBooksAction(): Promise<{ ok: boolean; error?: string }> {
  const session = await requireAdmin()
  try {
    await disconnectQuickBooks(session.organizationId)
  } catch {
    return { ok: false, error: 'QuickBooks could not be disconnected. Try again.' }
  }
  revalidatePath('/settings/integrations')
  return { ok: true }
}

export async function sendInvoiceToQuickBooksAction(invoiceId: string): Promise<SyncResult> {
  const session = await requireManager()
  if (!z.string().uuid().safeParse(invoiceId).success) return { ok: false, error: 'This page is out of date. Reload and try again.' }
  const features = await getOrgFeatures(session.organizationId)
  if (!features.quickbooks) return { ok: false, error: 'QuickBooks is not turned on for your company.' }
  const result = await syncInvoiceToQuickBooks(session.organizationId, invoiceId)
  revalidatePath(`/invoices/${invoiceId}`)
  return result
}

export async function syncAllToQuickBooksAction(): Promise<SyncResult> {
  const session = await requireAdmin()
  const features = await getOrgFeatures(session.organizationId)
  if (!features.quickbooks) return { ok: false, error: 'QuickBooks is not turned on for your company.' }
  const result = await syncAllInvoicesToQuickBooks(session.organizationId)
  revalidatePath('/settings/integrations')
  return result
}
