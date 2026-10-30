import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getPeopleNames } from '@/lib/people'
import {
  QUALIFICATION_SUMMARY_COLUMNS,
  isQualificationSetupError,
  type Applicability,
  type AssignmentMode,
  type Category,
  type EffectiveState,
  type ItemState,
  type QualificationSummary,
} from '@/lib/subcontractor-qualification'

export type QualificationAvailability = 'ready' | 'setup-required' | 'error'

export async function loadQualificationSummaries(
  supabase: SupabaseClient,
  organizationId: string,
  companyIds?: string[],
): Promise<{ availability: QualificationAvailability; byCompany: Record<string, QualificationSummary>; mode: AssignmentMode }> {
  let query = supabase
    .from('subcontractor_qualification_summary')
    .select(QUALIFICATION_SUMMARY_COLUMNS)
    .eq('organization_id', organizationId)
    .limit(5000)
  if (companyIds) {
    if (!companyIds.length) return { availability: 'ready', byCompany: {}, mode: await loadMode(supabase, organizationId) }
    query = query.in('subcontractor_company_id', companyIds.slice(0, 500))
  }
  const [{ data, error }, mode] = await Promise.all([query, loadMode(supabase, organizationId)])
  if (error) return { availability: isQualificationSetupError(error) ? 'setup-required' : 'error', byCompany: {}, mode }
  const byCompany: Record<string, QualificationSummary> = {}
  for (const row of (data ?? []) as unknown as QualificationSummary[]) byCompany[row.subcontractor_company_id] = row
  return { availability: 'ready', byCompany, mode }
}

/** Companies with no policy row yet are advisory: the default never blocks assignment. */
async function loadMode(supabase: SupabaseClient, organizationId: string): Promise<AssignmentMode> {
  const { data } = await supabase
    .from('subcontractor_qualification_policies')
    .select('assignment_mode')
    .eq('organization_id', organizationId)
    .maybeSingle()
  return data?.assignment_mode === 'enforcement' ? 'enforcement' : 'advisory'
}

export type EvidenceVersion = {
  id: string
  version_number: number
  original_filename: string
  content_type: string
  size_bytes: number
  uploaded_at: string
  uploaded_by_name: string | null
}

export type ChecklistItem = {
  requirementId: string
  itemId: string | null
  category: Category
  title: string
  guidance: string | null
  applicability: Applicability
  mandatory: boolean
  evidenceRequired: boolean
  expirationTracked: boolean
  restricted: boolean
  state: ItemState
  effective: EffectiveState
  effectiveDate: string | null
  expirationDate: string | null
  referenceNumber: string | null
  issuingAuthority: string | null
  notes: string | null
  rejectionReason: string | null
  notApplicableReason: string | null
  reviewedAt: string | null
  reviewedByName: string | null
  submittedAt: string | null
  /** Newest first. Empty for restricted items when the viewer is not an administrator. */
  evidence: EvidenceVersion[]
}

export type QualificationEvent = {
  id: string
  event: string
  from_state: string | null
  to_state: string | null
  detail: string | null
  created_at: string
  actor_name: string | null
  item_title: string | null
}

export type QualificationDetail = {
  availability: QualificationAvailability
  summary: QualificationSummary | null
  items: ChecklistItem[]
  events: QualificationEvent[]
}

type RequirementRow = {
  id: string
  category: Category
  title: string
  guidance: string | null
  evidence_required: boolean
  expiration_tracked: boolean
  restricted: boolean
  sort_order: number
}

type ChecklistRow = {
  requirement_id: string
  applicability: Applicability
  mandatory: boolean
  item_id: string | null
  effective: EffectiveState
}

type ItemRow = {
  id: string
  requirement_id: string
  state: ItemState
  effective_date: string | null
  expiration_date: string | null
  reference_number: string | null
  issuing_authority: string | null
  notes: string | null
  rejection_reason: string | null
  not_applicable_reason: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  submitted_at: string | null
}

type EvidenceRow = Omit<EvidenceVersion, 'uploaded_by_name'> & { item_id: string; uploaded_by: string | null }
type EventRow = {
  id: string
  item_id: string | null
  action: string
  from_state: string | null
  to_state: string | null
  notes: string | null
  created_at: string
  actor: string | null
}

export async function loadQualificationDetail(
  supabase: SupabaseClient,
  organizationId: string,
  companyId: string,
): Promise<QualificationDetail> {
  const empty: QualificationDetail = { availability: 'ready', summary: null, items: [], events: [] }
  const [summaryRes, checklistRes, itemsRes, evidenceRes, eventsRes] = await Promise.all([
    supabase
      .from('subcontractor_qualification_summary')
      .select(QUALIFICATION_SUMMARY_COLUMNS)
      .eq('organization_id', organizationId)
      .eq('subcontractor_company_id', companyId)
      .maybeSingle(),
    supabase
      .from('subcontractor_qualification_checklist')
      .select('requirement_id, applicability, mandatory, item_id, effective')
      .eq('organization_id', organizationId)
      .eq('subcontractor_company_id', companyId),
    supabase
      .from('subcontractor_qualification_items')
      .select(
        'id, requirement_id, state, effective_date, expiration_date, reference_number, issuing_authority, notes, rejection_reason, not_applicable_reason, reviewed_by, reviewed_at, submitted_at',
      )
      .eq('organization_id', organizationId)
      .eq('subcontractor_company_id', companyId),
    supabase
      .from('subcontractor_qualification_evidence')
      .select('id, item_id, version_number, original_filename, content_type, size_bytes, uploaded_at, uploaded_by')
      .eq('organization_id', organizationId)
      .eq('subcontractor_company_id', companyId)
      .order('version_number', { ascending: false })
      .limit(500),
    supabase
      .from('subcontractor_qualification_events')
      .select('id, item_id, action, from_state, to_state, notes, created_at, actor')
      .eq('organization_id', organizationId)
      .eq('subcontractor_company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  const firstError = [summaryRes, checklistRes, itemsRes, evidenceRes, eventsRes].find((r) => r.error)?.error
  if (firstError) return { ...empty, availability: isQualificationSetupError(firstError) ? 'setup-required' : 'error' }

  const checklist = (checklistRes.data ?? []) as ChecklistRow[]
  const requirementIds = checklist.map((c) => c.requirement_id)
  const reqRes = requirementIds.length
    ? await supabase
        .from('subcontractor_qualification_requirements')
        .select('id, category, title, guidance, evidence_required, expiration_tracked, restricted, sort_order')
        .in('id', requirementIds)
    : { data: [], error: null }
  if (reqRes.error) return { ...empty, availability: 'error' }

  const requirements = new Map(((reqRes.data ?? []) as RequirementRow[]).map((r) => [r.id, r]))
  const itemsById = new Map(((itemsRes.data ?? []) as ItemRow[]).map((i) => [i.id, i]))
  const evidenceRows = (evidenceRes.data ?? []) as EvidenceRow[]
  const eventRows = (eventsRes.data ?? []) as EventRow[]

  const names = await getPeopleNames([
    ...evidenceRows.map((e) => e.uploaded_by),
    ...eventRows.map((e) => e.actor),
    ...[...itemsById.values()].map((i) => i.reviewed_by),
  ])

  const evidenceByItem = new Map<string, EvidenceVersion[]>()
  for (const e of evidenceRows) {
    const list = evidenceByItem.get(e.item_id) ?? []
    list.push({
      id: e.id,
      version_number: e.version_number,
      original_filename: e.original_filename,
      content_type: e.content_type,
      size_bytes: e.size_bytes,
      uploaded_at: e.uploaded_at,
      uploaded_by_name: e.uploaded_by ? (names[e.uploaded_by] ?? null) : null,
    })
    evidenceByItem.set(e.item_id, list)
  }

  const items: (ChecklistItem & { sort: number })[] = []
  for (const c of checklist) {
    const r = requirements.get(c.requirement_id)
    if (!r) continue
    const i = c.item_id ? itemsById.get(c.item_id) : undefined
    items.push({
      sort: r.sort_order,
      requirementId: r.id,
      itemId: i?.id ?? null,
      category: r.category,
      title: r.title,
      guidance: r.guidance,
      applicability: c.applicability,
      mandatory: c.mandatory,
      evidenceRequired: r.evidence_required,
      expirationTracked: r.expiration_tracked,
      restricted: r.restricted,
      state: i?.state ?? 'not_started',
      effective: c.effective,
      effectiveDate: i?.effective_date ?? null,
      expirationDate: i?.expiration_date ?? null,
      referenceNumber: i?.reference_number ?? null,
      issuingAuthority: i?.issuing_authority ?? null,
      notes: i?.notes ?? null,
      rejectionReason: i?.rejection_reason ?? null,
      notApplicableReason: i?.not_applicable_reason ?? null,
      reviewedAt: i?.reviewed_at ?? null,
      reviewedByName: i?.reviewed_by ? (names[i.reviewed_by] ?? null) : null,
      submittedAt: i?.submitted_at ?? null,
      evidence: i ? (evidenceByItem.get(i.id) ?? []) : [],
    })
  }
  items.sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title))

  const titleByItem = new Map(items.filter((i) => i.itemId).map((i) => [i.itemId!, i.title]))
  const events = eventRows.map((e) => ({
    id: e.id,
    event: e.action,
    from_state: e.from_state,
    to_state: e.to_state,
    detail: e.notes,
    created_at: e.created_at,
    actor_name: e.actor ? (names[e.actor] ?? null) : null,
    item_title: e.item_id ? (titleByItem.get(e.item_id) ?? null) : null,
  }))

  return {
    availability: 'ready',
    summary: (summaryRes.data as unknown as QualificationSummary | null) ?? null,
    items: items.map(({ sort: _sort, ...rest }) => rest),
    events,
  }
}
