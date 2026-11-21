import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { BillableChangeOrder, BillableTimeEntry } from '@/lib/invoice-sources'

export type BillableSources = {
  changeOrders: BillableChangeOrder[]
  time: BillableTimeEntry[]
  names: [string, string][]
  /** False until the Add-from database update is applied. */
  available: boolean
}

/**
 * Approved change orders (that add to the price) and approved crew time on a project, each marked with the invoice
 * already billing it. Lines on `excludeInvoiceId` (the draft being edited) don't count as billed.
 */
export async function listBillableSources(organizationId: string, projectId: string, excludeInvoiceId: string | null): Promise<BillableSources> {
  const supabase = await createClient()
  const [cos, time, billed] = await Promise.all([
    supabase
      .from('change_orders')
      .select('id, co_number, title, price_adjustment_cents, selection_id, decision_at')
      .eq('organization_id', organizationId)
      .eq('project_id', projectId)
      .eq('status', 'approved')
      .gt('price_adjustment_cents', 0)
      .order('decision_at', { ascending: true }),
    supabase
      .from('time_entries')
      .select('id, user_id, worked_minutes, hourly_cost_cents, started_at')
      .eq('organization_id', organizationId)
      .eq('project_id', projectId)
      .eq('status', 'approved')
      .order('started_at', { ascending: true })
      .limit(2000),
    supabase
      .from('invoice_line_sources')
      .select('source_type, source_id, invoice_id, invoices!inner(invoice_number, status, project_id)')
      .eq('organization_id', organizationId)
      .eq('invoices.project_id', projectId)
      .neq('invoices.status', 'voided'),
  ])
  if (billed.error) return { changeOrders: [], time: [], names: [], available: false }

  const billedOn = new Map<string, string>()
  for (const b of (billed.data ?? []) as unknown as { source_type: string; source_id: string; invoice_id: string; invoices: { invoice_number: string | null } }[]) {
    if (b.invoice_id === excludeInvoiceId) continue
    billedOn.set(`${b.source_type}:${b.source_id}`, b.invoices.invoice_number ?? 'another invoice')
  }

  const coRows = cos.data ?? []
  const selectionIds = [...new Set(coRows.map((c) => c.selection_id).filter(Boolean))] as string[]
  const timeRows = time.data ?? []
  const userIds = [...new Set(timeRows.map((t) => t.user_id as string))]
  const [selections, profiles] = await Promise.all([
    selectionIds.length ? supabase.from('selections').select('id, name').in('id', selectionIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    userIds.length ? supabase.from('profiles').select('id, full_name, email').in('id', userIds) : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string | null }[] }),
  ])
  const selectionName = new Map((selections.data ?? []).map((s) => [s.id as string, s.name as string]))

  return {
    available: true,
    changeOrders: coRows.map((c) => ({
      id: c.id as string,
      co_number: (c.co_number as string | null) ?? null,
      title: c.title as string,
      price_cents: Number(c.price_adjustment_cents ?? 0),
      selection_name: c.selection_id ? (selectionName.get(c.selection_id as string) ?? null) : null,
      billed_on: billedOn.get(`change_order:${c.id}`) ?? null,
    })),
    time: timeRows.map((t) => ({
      id: t.id as string,
      user_id: t.user_id as string,
      worked_minutes: Number(t.worked_minutes ?? 0),
      hourly_cost_cents: t.hourly_cost_cents === null ? null : Number(t.hourly_cost_cents),
      started_at: t.started_at as string,
      billed_on: billedOn.get(`time_entry:${t.id}`) ?? null,
    })),
    names: (profiles.data ?? []).map((p) => [p.id as string, (p.full_name || p.email || 'Team member') as string]),
  }
}
