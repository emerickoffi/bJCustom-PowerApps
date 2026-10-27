import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { EstimateLineItem, EstimateStatus, EstimateTotals } from '@/lib/estimates'

type Ref<T> = T | T[] | null
const one = <T,>(ref: Ref<T>): T | null => (Array.isArray(ref) ? (ref[0] ?? null) : ref)

export type EstimateRecord = EstimateTotals & {
  id: string
  organization_id: string
  project_id: string
  client_id: string | null
  family_id: string
  revision: number
  revised_from_id: string | null
  estimate_number: string
  name: string
  description: string | null
  estimate_date: string
  expiration_date: string | null
  status: EstimateStatus
  notes: string | null
  is_demo: boolean
  submitted_at: string | null
  decision_at: string | null
  decision_by_name: string | null
  decision_method: string | null
  decision_note: string | null
  created_at: string
  updated_at: string
  project: {
    id: string
    name: string
    project_number: string
    address_line1: string | null
    city: string | null
    state: string | null
    postal_code: string | null
  } | null
  client: { id: string; first_name: string; last_name: string; email: string | null } | null
}

const ESTIMATE_SELECT =
  '*, project:projects(id, name, project_number, address_line1, city, state, postal_code), client:clients(id, first_name, last_name, email)'

function normalize(row: Record<string, unknown>): EstimateRecord {
  return {
    ...(row as unknown as EstimateRecord),
    project: one(row.project as Ref<EstimateRecord['project']>),
    client: one(row.client as Ref<EstimateRecord['client']>),
  }
}

export function clientDisplayName(client: EstimateRecord['client']) {
  return client ? `${client.first_name} ${client.last_name}`.trim() : null
}

export async function getEstimate(id: string, organizationId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('estimates')
    .select(ESTIMATE_SELECT)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .maybeSingle()
  return data ? normalize(data) : null
}

export async function getEstimateLineItems(estimateId: string): Promise<EstimateLineItem[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('estimate_line_items')
    .select(
      'id, category, description, quantity, unit, material_unit_cents, labor_unit_cents, other_unit_cents, is_allowance, sort_order, notes, line_total_cents',
    )
    .eq('estimate_id', estimateId)
    .order('sort_order')
    .order('created_at')
  return (data ?? []) as EstimateLineItem[]
}

export async function getEstimateFamily(familyId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('estimates')
    .select('id, revision, status, construction_total_cents, total_with_land_cents, created_at, decision_at')
    .eq('family_id', familyId)
    .order('revision', { ascending: false })
  return (data ?? []) as {
    id: string
    revision: number
    status: EstimateStatus
    construction_total_cents: number
    total_with_land_cents: number
    created_at: string
    decision_at: string | null
  }[]
}

export async function listEstimates(organizationId: string, filters: { projectId?: string; status?: string }) {
  const supabase = await createClient()
  let query = supabase
    .from('estimates')
    .select(ESTIMATE_SELECT)
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(500)
  if (filters.projectId) query = query.eq('project_id', filters.projectId)
  const { data } = await query
  const rows = (data ?? []).map(normalize)

  const latestByFamily = new Map<string, EstimateRecord>()
  const revisionCount = new Map<string, number>()
  for (const row of rows) {
    revisionCount.set(row.family_id, (revisionCount.get(row.family_id) ?? 0) + 1)
    const current = latestByFamily.get(row.family_id)
    if (!current || row.revision > current.revision) latestByFamily.set(row.family_id, row)
  }
  const latest = [...latestByFamily.values()]
    .filter((r) => !filters.status || r.status === filters.status)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
  return { estimates: latest, revisionCount, all: rows }
}
