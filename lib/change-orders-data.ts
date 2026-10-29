import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { isChangeOrderStatus, type ChangeOrderStatus } from '@/lib/change-orders'

export type ChangeOrderDetail = {
  id: string
  project_id: string
  co_number: string
  title: string
  description: string | null
  reason: string | null
  requested_by: string | null
  schedule_impact_days: number | null
  price_adjustment_cents: number
  cost_adjustment_cents: number
  status: ChangeOrderStatus
  version: number
  sent_to_homeowner_at: string | null
  decision_at: string | null
  decision_by_name: string | null
  decision_method: string | null
  decision_note: string | null
  signature_request_id: string | null
  voided_at: string | null
  void_reason: string | null
  created_at: string
  updated_at: string
}

export type ChangeOrderLine = {
  id: string
  category: string
  description: string
  quantity: number
  unit: string
  unit_cost_cents: number
  cost_cents: number
}

export async function loadChangeOrder(projectId: string, id: string) {
  const supabase = await createClient()
  const [{ data: co }, { data: lines }] = await Promise.all([
    supabase.from('change_orders').select('*').eq('id', id).eq('project_id', projectId).maybeSingle(),
    supabase
      .from('change_order_line_items')
      .select('id, category, description, quantity, unit, unit_cost_cents, cost_cents')
      .eq('change_order_id', id)
      .order('sort_order'),
  ])
  if (!co || !isChangeOrderStatus(co.status)) return null
  return {
    co: { ...co, price_adjustment_cents: Number(co.price_adjustment_cents), cost_adjustment_cents: Number(co.cost_adjustment_cents) } as ChangeOrderDetail,
    lines: ((lines ?? []) as ChangeOrderLine[]).map((l) => ({
      ...l,
      quantity: Number(l.quantity),
      unit_cost_cents: Number(l.unit_cost_cents),
      cost_cents: Number(l.cost_cents),
    })),
  }
}
