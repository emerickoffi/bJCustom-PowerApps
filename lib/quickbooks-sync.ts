import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { QuickBooksError, quickBooksClient } from '@/lib/quickbooks'
import {
  canSendInvoice, customerDisplayName, invoiceLinesTotalCents, pickIncomeAccount, qboQueryLiteral,
  toQboCustomer, toQboInvoice, toQboPayment, type QboClient,
} from '@/lib/quickbooks-mapping'

const SERVICE_ITEM_NAME = 'Construction services (Trefort)'

type Client = Awaited<ReturnType<typeof quickBooksClient>>
type Link = { entity_type: string; local_id: string; qbo_id: string; sync_token: string | null }

export type SyncResult = { ok: true; message: string } | { ok: false; error: string }

async function saveLink(orgId: string, entity: 'client' | 'invoice' | 'payment', localId: string, qboId: string, syncToken: string | null) {
  await createAdminClient()
    .from('quickbooks_sync_links')
    .upsert({ organization_id: orgId, entity_type: entity, local_id: localId, qbo_id: qboId, sync_token: syncToken, synced_at: new Date().toISOString() },
      { onConflict: 'organization_id,entity_type,local_id' })
}

async function ensureServiceItem(orgId: string, qbo: Client): Promise<string> {
  if (qbo.serviceItemId) return qbo.serviceItemId
  const found = await qbo.query<{ Item?: { Id: string }[] }>(`select Id from Item where Name = ${qboQueryLiteral(SERVICE_ITEM_NAME)}`)
  let id = found.Item?.[0]?.Id
  if (!id) {
    const accounts = await qbo.query<{ Account?: { Id: string; Name: string; Active?: boolean }[] }>(
      "select Id, Name, Active from Account where AccountType = 'Income' maxresults 50",
    )
    const incomeId = pickIncomeAccount(accounts.Account ?? [])
    if (!incomeId) throw new QuickBooksError('Your QuickBooks company has no income account. Add one in QuickBooks and try again.')
    const created = await qbo.post<{ Item: { Id: string } }>('item', { Name: SERVICE_ITEM_NAME, Type: 'Service', IncomeAccountRef: { value: incomeId } })
    id = created.Item.Id
  }
  await createAdminClient().from('quickbooks_connections').update({ service_item_id: id }).eq('organization_id', orgId)
  return id
}

async function ensureCustomer(orgId: string, qbo: Client, clientId: string, client: QboClient, link: Link | undefined): Promise<string> {
  if (link) return link.qbo_id
  // Link to an existing QuickBooks customer with the same name rather than creating a duplicate.
  const name = customerDisplayName(client)
  const found = await qbo.query<{ Customer?: { Id: string; SyncToken: string }[] }>(
    `select Id, SyncToken from Customer where DisplayName = ${qboQueryLiteral(name)}`,
  )
  const existing = found.Customer?.[0]
  const customer = existing ?? (await qbo.post<{ Customer: { Id: string; SyncToken: string } }>('customer', toQboCustomer(client))).Customer
  await saveLink(orgId, 'client', clientId, customer.Id, customer.SyncToken)
  return customer.Id
}

/**
 * Sends one issued invoice to QuickBooks (creating the customer if needed), then its payments.
 * Already-sent invoices are not re-sent; voided invoices are voided in QuickBooks; reversed payments are deleted.
 */
export async function syncInvoiceToQuickBooks(
  orgId: string,
  invoiceId: string,
  opts: { db?: SupabaseClient } = {},
): Promise<SyncResult> {
  // Signed-in staff use their own (RLS) client; background jobs pass the service client, always scoped by orgId.
  const supabase = opts.db ?? (await createClient())
  const { data: inv } = await supabase
    .from('invoices')
    .select(`id, organization_id, client_id, invoice_number, title, invoice_date, due_date, status, tax_cents, total_cents, notes,
      projects(name),
      clients(first_name, last_name, company_name, email, phone, address_line1, address_line2, city, state, postal_code, country),
      invoice_line_items(description, quantity, unit_rate_cents, amount_cents, position),
      invoice_payments(id, payment_date, amount_cents, method, reference, reversed_at)`)
    .eq('id', invoiceId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (!inv) return { ok: false, error: 'Invoice not found.' }

  const project = (Array.isArray(inv.projects) ? inv.projects[0] : inv.projects) as { name: string } | null
  const client = (Array.isArray(inv.clients) ? inv.clients[0] : inv.clients) as QboClient | null
  if (!client) return { ok: false, error: 'This invoice has no client.' }
  const lines = (inv.invoice_line_items ?? []).map((l) => ({ ...l, quantity: Number(l.quantity) }))
  const source = {
    invoice_number: inv.invoice_number, title: inv.title, invoice_date: inv.invoice_date, due_date: inv.due_date,
    status: inv.status, tax_cents: Number(inv.tax_cents), total_cents: Number(inv.total_cents), notes: inv.notes,
    project_name: project?.name ?? null, lines,
  }

  const { data: linkRows } = await supabase
    .from('quickbooks_sync_links')
    .select('entity_type, local_id, qbo_id, sync_token')
    .eq('organization_id', orgId)
    .in('local_id', [inv.id, inv.client_id, ...(inv.invoice_payments ?? []).map((p) => p.id)])
  const links = (linkRows ?? []) as Link[]
  const linkFor = (type: string, id: string) => links.find((l) => l.entity_type === type && l.local_id === id)
  const invoiceLink = linkFor('invoice', inv.id)

  if (!invoiceLink) {
    if (inv.status === 'void') return { ok: false, error: 'Voided invoices are not sent to QuickBooks.' }
    const check = canSendInvoice(source)
    if (!check.ok) return { ok: false, error: check.reason }
    if (invoiceLinesTotalCents(source) !== source.total_cents) {
      return { ok: false, error: 'This invoice’s lines don’t add up to its total, so it was not sent. Contact support.' }
    }
  }

  try {
    const qbo = await quickBooksClient(orgId)
    const customerId = await ensureCustomer(orgId, qbo, inv.client_id, client, linkFor('client', inv.client_id))

    let qboInvoiceId = invoiceLink?.qbo_id
    let qboInvoiceToken = invoiceLink?.sync_token ?? null
    if (!qboInvoiceId) {
      const itemId = await ensureServiceItem(orgId, qbo)
      const created = await qbo.post<{ Invoice: { Id: string; SyncToken: string } }>('invoice', toQboInvoice(source, customerId, itemId))
      qboInvoiceId = created.Invoice.Id
      qboInvoiceToken = created.Invoice.SyncToken
      await saveLink(orgId, 'invoice', inv.id, qboInvoiceId, qboInvoiceToken)
    }

    let sent = 0
    let removed = 0
    for (const p of inv.invoice_payments ?? []) {
      const link = linkFor('payment', p.id)
      if (p.reversed_at) {
        if (link) {
          const current = await qbo.query<{ Payment?: { Id: string; SyncToken: string }[] }>(`select Id, SyncToken from Payment where Id = ${qboQueryLiteral(link.qbo_id)}`)
          const pay = current.Payment?.[0]
          if (pay) await qbo.post('payment?operation=delete', { Id: pay.Id, SyncToken: pay.SyncToken })
          await createAdminClient().from('quickbooks_sync_links').delete().eq('organization_id', orgId).eq('entity_type', 'payment').eq('local_id', p.id)
          removed++
        }
        continue
      }
      if (link) continue
      const created = await qbo.post<{ Payment: { Id: string; SyncToken: string } }>(
        'payment',
        toQboPayment({ payment_date: p.payment_date, amount_cents: Number(p.amount_cents), method: p.method, reference: p.reference }, customerId, qboInvoiceId),
      )
      await saveLink(orgId, 'payment', p.id, created.Payment.Id, created.Payment.SyncToken)
      sent++
    }

    if (inv.status === 'void') {
      const current = await qbo.query<{ Invoice?: { Id: string; SyncToken: string; Balance?: number }[] }>(`select Id, SyncToken from Invoice where Id = ${qboQueryLiteral(qboInvoiceId)}`)
      const q = current.Invoice?.[0]
      if (q) await qbo.post('invoice?operation=void', { Id: q.Id, SyncToken: q.SyncToken })
    }

    const admin = createAdminClient()
    const now = new Date().toISOString()
    await admin.from('invoices')
      .update({ accounting_sync_status: inv.status === 'void' ? 'voided' : 'synced', external_accounting_id: qboInvoiceId })
      .eq('id', inv.id).eq('organization_id', orgId)
    await admin.from('quickbooks_connections').update({ last_synced_at: now, last_error: null, updated_at: now }).eq('organization_id', orgId)

    const parts = [
      invoiceLink ? 'Invoice already in QuickBooks' : 'Invoice sent to QuickBooks',
      sent ? `${sent} payment${sent === 1 ? '' : 's'} recorded` : null,
      removed ? `${removed} reversed payment${removed === 1 ? '' : 's'} removed` : null,
      inv.status === 'void' ? 'voided in QuickBooks' : null,
    ].filter(Boolean)
    return { ok: true, message: `${parts.join(', ')}.` }
  } catch (err) {
    const message = err instanceof QuickBooksError ? err.message : 'QuickBooks sync failed. Try again in a minute.'
    if (!(err instanceof QuickBooksError)) console.error('[quickbooks] sync failed', { invoiceId, message: err instanceof Error ? err.message : String(err) })
    await createAdminClient().from('invoices').update({ accounting_sync_status: 'error' }).eq('id', inv.id).eq('organization_id', orgId)
    await createAdminClient().from('quickbooks_connections').update({ last_error: message, updated_at: new Date().toISOString() }).eq('organization_id', orgId)
    return { ok: false, error: message }
  }
}

/** Sends every issued invoice that isn't in QuickBooks yet, plus new payments on ones that are. */
export async function syncAllInvoicesToQuickBooks(orgId: string): Promise<SyncResult> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('invoices')
    .select('id')
    .eq('organization_id', orgId)
    .neq('status', 'draft')
    .order('invoice_date', { ascending: true })
    .limit(200)
  let ok = 0
  const errors: string[] = []
  for (const row of data ?? []) {
    const r = await syncInvoiceToQuickBooks(orgId, row.id)
    if (r.ok) ok++
    else if (!/Voided invoices are not sent/.test(r.error)) errors.push(r.error)
    if (errors.some((e) => /reconnect/i.test(e))) break
  }
  if (errors.length && !ok) return { ok: false, error: errors[0] }
  return { ok: true, message: `${ok} invoice${ok === 1 ? '' : 's'} up to date in QuickBooks${errors.length ? `; ${errors.length} need attention (${errors[0]})` : ''}.` }
}

/**
 * Background sync after a payment changes (online payment, refund, recorded or reversed payment, void).
 * Does nothing unless QuickBooks is turned on and connected for the company. Never throws: errors are saved on the
 * connection (shown in Settings → Integrations) and on the invoice's sync status.
 */
export async function autoSyncInvoiceToQuickBooks(orgId: string, invoiceId: string): Promise<void> {
  try {
    const admin = createAdminClient()
    const [{ data: conn }, { data: enabled }] = await Promise.all([
      admin.from('quickbooks_connections').select('status').eq('organization_id', orgId).maybeSingle(),
      admin.rpc('is_feature_enabled', { p_org: orgId, p_key: 'quickbooks' }),
    ])
    if (!conn || conn.status === 'needs_reauth' || enabled !== true) return
    const result = await syncInvoiceToQuickBooks(orgId, invoiceId, { db: admin })
    if (!result.ok) console.warn('[quickbooks] auto-sync skipped', { invoiceId, error: result.error })
  } catch (err) {
    console.error('[quickbooks] auto-sync failed', { invoiceId, message: err instanceof Error ? err.message : String(err) })
  }
}
