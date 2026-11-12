import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  SELECTIONS_BUCKET,
  isSelectionStatus,
  type PortalSelectionDetail,
  type PortalSelectionListItem,
  type SelectionEvent,
  type SelectionListRow,
  type SelectionOption,
  type SelectionStatus,
} from '@/lib/selections'

const SIGNED_URL_SECONDS = 60 * 30

/**
 * Paths are only signed after RLS or a portal RPC has already returned them to this
 * caller, so the admin client never widens access beyond what the database allowed.
 */
async function signPaths(paths: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => Boolean(p)))]
  const map = new Map<string, string>()
  if (unique.length === 0) return map
  const { data } = await createAdminClient().storage.from(SELECTIONS_BUCKET).createSignedUrls(unique, SIGNED_URL_SECONDS)
  for (const row of data ?? []) if (row.path && row.signedUrl) map.set(row.path, row.signedUrl)
  return map
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))

export async function getProjectSelections(projectId: string): Promise<{ rows: SelectionListRow[]; error: boolean }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('selections')
    .select('id, name, category, location, status, allowance_cents, selected_price_cents, due_date, updated_at')
    .eq('project_id', projectId)
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
  if (error) console.error('selections list failed', error.message)
  const rows = (data ?? [])
    .filter((r) => isSelectionStatus(r.status))
    .map((r) => ({
      ...r,
      status: r.status as SelectionStatus,
      allowance_cents: num(r.allowance_cents),
      selected_price_cents: num(r.selected_price_cents),
    }))
  return { rows, error: Boolean(error) }
}

export async function getSelectionCategories(): Promise<string[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('selection_categories').select('name').order('name')
  return (data ?? []).map((r) => r.name as string)
}

export type LinkedChangeOrder = { id: string; co_number: string | null; number: number; title: string; status: string; price_adjustment_cents: number; selection_revision: number | null }

export type StaffSelectionDetail = {
  id: string
  project_id: string
  name: string
  category: string
  description: string | null
  location: string | null
  notes: string | null
  internal_notes: string | null
  allowance_cents: number | null
  cost_code: string | null
  due_date: string | null
  status: SelectionStatus
  revision: number
  version: number
  selected_option_id: string | null
  selected_price_cents: number | null
  selected_at: string | null
  selected_by_name: string | null
  homeowner_comment: string | null
  sent_at: string | null
  options: SelectionOption[]
  events: SelectionEvent[]
  changeOrders: LinkedChangeOrder[]
  amounts: { difference_cents: number | null; approved_change_orders_cents: number; change_order_needed_cents: number }
}

export async function getSelectionDetail(projectId: string, selectionId: string): Promise<StaffSelectionDetail | null> {
  const supabase = await createClient()
  const { data: s, error } = await supabase
    .from('selections')
    .select(
      'id, project_id, name, category, description, location, notes, internal_notes, allowance_cents, cost_code, due_date, status, revision, version, selected_option_id, selected_price_cents, selected_at, selected_by_name, homeowner_comment, sent_at',
    )
    .eq('id', selectionId)
    .eq('project_id', projectId)
    .maybeSingle()
  if (error) console.error('selection detail failed', error.message)
  if (!s || !isSelectionStatus(s.status)) return null

  const [options, events, cos, amounts] = await Promise.all([
    supabase
      .from('selection_options')
      .select('id, name, description, supplier, model_number, price_cents, internal_cost_cents, availability, photo_path, spec_path, spec_name, sort_order')
      .eq('selection_id', selectionId)
      .order('sort_order')
      .order('created_at'),
    supabase
      .from('selection_events')
      .select('id, event, from_status, to_status, actor_name, actor_kind, note, internal, created_at')
      .eq('selection_id', selectionId)
      .order('created_at', { ascending: false }),
    supabase
      .from('change_orders')
      .select('id, co_number, number, title, status, price_adjustment_cents, selection_revision')
      .eq('selection_id', selectionId)
      .order('number', { ascending: false }),
    supabase.rpc('selection_amounts', { p_selection: selectionId }),
  ])

  const optionRows = (options.data ?? []) as SelectionOption[]
  const urls = await signPaths(optionRows.flatMap((o) => [o.photo_path, o.spec_path]))
  const a = (amounts.data ?? {}) as Record<string, unknown>

  return {
    ...s,
    status: s.status,
    allowance_cents: num(s.allowance_cents),
    selected_price_cents: num(s.selected_price_cents),
    options: optionRows.map((o) => ({
      ...o,
      price_cents: Number(o.price_cents),
      internal_cost_cents: num(o.internal_cost_cents),
      photo_url: o.photo_path ? (urls.get(o.photo_path) ?? null) : null,
      spec_url: o.spec_path ? (urls.get(o.spec_path) ?? null) : null,
    })),
    events: (events.data ?? []) as SelectionEvent[],
    changeOrders: ((cos.data ?? []) as LinkedChangeOrder[]).map((c) => ({ ...c, number: Number(c.number), price_adjustment_cents: Number(c.price_adjustment_cents) })),
    amounts: {
      difference_cents: num(a.difference_cents),
      approved_change_orders_cents: Number(a.approved_change_orders_cents ?? 0),
      change_order_needed_cents: Number(a.change_order_needed_cents ?? 0),
    },
  }
}

export async function getPortalSelections(): Promise<PortalSelectionListItem[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('portal_selection_list')
  if (error) {
    console.error('portal_selection_list failed', error.message)
    return []
  }
  return ((data ?? []) as PortalSelectionListItem[]).filter((r) => isSelectionStatus(r.status))
}

export async function getPortalSelectionDetail(selectionId: string): Promise<PortalSelectionDetail | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('portal_selection_detail', { p_selection: selectionId })
  if (error) {
    console.error('portal_selection_detail failed', error.message)
    return null
  }
  const detail = (data ?? null) as PortalSelectionDetail | null
  if (!detail) return null
  const urls = await signPaths(detail.options.flatMap((o) => [o.photo_path, o.spec_path]))
  return {
    ...detail,
    options: detail.options.map((o) => ({
      ...o,
      photo_url: o.photo_path ? (urls.get(o.photo_path) ?? null) : null,
      spec_url: o.spec_path ? (urls.get(o.spec_path) ?? null) : null,
    })),
  }
}
