import 'server-only'
import type { createClient } from '@/lib/supabase/server'
import type { FeatureMap } from '@/lib/feature-registry'
import type { AssistantLink } from '@/lib/ai/assistant-scope'
import { findHealthProject } from '@/lib/ai/assistant-context'
import { formatMoney } from '@/lib/financials'
import { ESTIMATE_STATUS_LABELS, type EstimateStatus } from '@/lib/estimates'
import { INVOICE_STATUS_LABELS, type InvoiceStatus } from '@/lib/invoices'
import { loadQualificationSummaries } from '@/lib/subcontractor-qualification-data'
import {
  QUALIFICATION_FILTER_LABELS,
  matchesQualificationFilter,
  nextRequiredAction,
  qualificationBadge,
  type QualificationFilter,
} from '@/lib/subcontractor-qualification'
import { getActionItems } from '@/lib/attention-data'
import { ACTION_CATEGORY_LABELS } from '@/lib/action-items'
import { loadCompletionReadiness } from '@/lib/completion-readiness-data'

/**
 * Read-only, on-demand retrieval for the assistant. Every query runs through the signed-in
 * user's RLS client, pinned to their organization. Feature flags and the manager-only
 * financial rule are checked here as well, so a tool never returns more than the app's own pages.
 */
export type RetrievalScope = {
  supabase: Awaited<ReturnType<typeof createClient>>
  features: FeatureMap
  organizationId: string
  userId: string
  /** Same rule the app uses for financial pages (canManage). */
  manager: boolean
  /** Set when a project is open; any model-supplied project name is then ignored. */
  projectId: string | null
  today: string
}

export type RetrievalResult = { data: Record<string, unknown>; links: AssistantLink[] }

const LOAD_FAILED = 'could not be retrieved right now; say so and do not guess'
const RECORD_LIMIT = 15
const result = (data: Record<string, unknown>, links: AssistantLink[] = []): RetrievalResult => ({ data, links })
const unavailable = (reason: string) => result({ unavailable: reason })

type Ref<T> = T | T[] | null
const one = <T,>(ref: Ref<T>): T | null => (Array.isArray(ref) ? (ref[0] ?? null) : ref)

type ProjectRef = { id: string; name: string; project_number: string | null; status?: string | null }

async function resolveProject(
  scope: RetrievalScope,
  query: string | undefined,
): Promise<{ project: ProjectRef | null; problem?: Record<string, unknown> }> {
  if (scope.projectId) {
    const { data, error } = await scope.supabase
      .from('projects')
      .select('id, name, project_number, status')
      .eq('id', scope.projectId)
      .eq('organization_id', scope.organizationId)
      .maybeSingle()
    if (error) return { project: null, problem: { error: `The open project ${LOAD_FAILED}.` } }
    if (!data) return { project: null, problem: { not_found: 'The open project is not available to this user.' } }
    return { project: data as ProjectRef }
  }
  if (!query?.trim()) return { project: null }
  const { rows, error } = await findHealthProject(scope.supabase, scope.organizationId, query)
  if (error) return { project: null, problem: { error: `Projects ${LOAD_FAILED}.` } }
  if (rows.length > 1) {
    return {
      project: null,
      problem: {
        ambiguous: true,
        matching_projects: rows.map((r) => ({ name: r.name, project_number: r.project_number })),
        instruction: 'Ask the user which project they mean.',
      },
    }
  }
  if (!rows.length) return { project: null, problem: { not_found: 'No accessible project matches. Ask the user to check the name or number.' } }
  return { project: rows[0] as ProjectRef }
}

const cleanTerm = (value: string | undefined) =>
  (value ?? '').replace(/[^\p{L}\p{N} #.'-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
const escapeLike = (value: string) => value.replace(/[%_\\]/g, (c) => `\\${c}`)

function moreNote(total: number, shown: number) {
  return total > shown ? `Showing ${shown} of ${total} matching records. Say the list is partial and suggest narrowing the question.` : null
}

// ---------------------------------------------------------------- Estimates

const ESTIMATE_COLUMNS =
  'id, project_id, family_id, revision, estimate_number, name, status, estimate_date, expiration_date, submitted_at, decision_at, decision_method, construction_total_cents, total_with_land_cents, direct_cost_cents, markup_cents, contingency_cents, allowance_cents, land_cost_cents, projects(name, project_number)'

type EstimateRow = {
  id: string
  project_id: string
  family_id: string
  revision: number
  estimate_number: string
  name: string
  status: EstimateStatus
  estimate_date: string | null
  expiration_date: string | null
  submitted_at: string | null
  decision_at: string | null
  decision_method: string | null
  construction_total_cents: number
  total_with_land_cents: number
  direct_cost_cents: number
  markup_cents: number
  contingency_cents: number
  allowance_cents: number
  land_cost_cents: number | null
  projects: Ref<{ name: string; project_number: string | null }>
}

const OPEN_ESTIMATE_STATUSES: EstimateStatus[] = ['draft', 'internal_review', 'submitted']

/** Signed means a completed signature request exists for the estimate's signing document. It is not approval. */
async function signedEstimateIds(scope: RetrievalScope, ids: string[]): Promise<Set<string> | null> {
  if (!ids.length || !scope.features.documents || !scope.features.e_signatures) return new Set()
  const { data: snapshots, error } = await scope.supabase
    .from('estimate_signing_snapshots')
    .select('estimate_id, document_id')
    .eq('organization_id', scope.organizationId)
    .in('estimate_id', ids)
  if (error) return null
  const docIds = [...new Set((snapshots ?? []).map((s) => s.document_id as string))]
  if (!docIds.length) return new Set()
  const { data: requests, error: reqError } = await scope.supabase
    .from('signature_requests')
    .select('document_id')
    .eq('organization_id', scope.organizationId)
    .eq('status', 'completed')
    .in('document_id', docIds)
  if (reqError) return null
  const signedDocs = new Set((requests ?? []).map((r) => r.document_id as string))
  return new Set((snapshots ?? []).filter((s) => signedDocs.has(s.document_id as string)).map((s) => s.estimate_id as string))
}

export async function loadEstimatesForAssistant(
  scope: RetrievalScope,
  input: { project?: string; estimateNumber?: string; status?: EstimateStatus },
): Promise<RetrievalResult> {
  if (!scope.features.estimates) return unavailable('Estimates are turned off for this company.')
  if (!scope.manager) return unavailable('Estimate financials are limited to project managers and admins.')

  const resolved = await resolveProject(scope, input.project)
  if (resolved.problem) return result(resolved.problem)

  const number = cleanTerm(input.estimateNumber)
  let query = scope.supabase
    .from('estimates')
    .select(ESTIMATE_COLUMNS)
    .eq('organization_id', scope.organizationId)
    .order('created_at', { ascending: false })
    .limit(400)
  if (resolved.project) query = query.eq('project_id', resolved.project.id)
  if (number) query = query.ilike('estimate_number', escapeLike(number))
  const { data, error } = await query
  if (error) return result({ error: `Estimates ${LOAD_FAILED}.` })
  const rows = (data ?? []) as unknown as EstimateRow[]

  const revisions = new Map<string, number>()
  const latest = new Map<string, EstimateRow>()
  for (const row of rows) {
    revisions.set(row.family_id, (revisions.get(row.family_id) ?? 0) + 1)
    const current = latest.get(row.family_id)
    if (!current || row.revision > current.revision) latest.set(row.family_id, row)
  }
  const matching = [...latest.values()].filter((r) => !input.status || r.status === input.status)
  if (!matching.length) {
    return result({
      scope: resolved.project ? `project ${resolved.project.name}` : 'all accessible projects',
      estimates: [],
      note: number ? `No accessible estimate numbered ${number}.` : 'No estimates match.',
    })
  }

  const shown = matching.slice(0, RECORD_LIMIT)
  const signed = await signedEstimateIds(scope, shown.map((e) => e.id))
  const countsByStatus: Record<string, number> = {}
  for (const e of matching) countsByStatus[ESTIMATE_STATUS_LABELS[e.status]] = (countsByStatus[ESTIMATE_STATUS_LABELS[e.status]] ?? 0) + 1

  const links: AssistantLink[] = []
  const records = shown.map((e, i) => {
    const key = `estimate_${i + 1}`
    links.push({ key, label: `${e.estimate_number} ${e.name}`.slice(0, 80), href: `/estimates/${e.id}` })
    const project = one(e.projects)
    return {
      link_key: key,
      estimate_number: e.estimate_number,
      revision: e.revision,
      revision_count: revisions.get(e.family_id) ?? 1,
      name: e.name,
      project: project?.name ?? null,
      approval_status: ESTIMATE_STATUS_LABELS[e.status],
      signed_by_client: signed ? signed.has(e.id) : 'could not be checked',
      signed_but_not_approved: signed ? signed.has(e.id) && e.status !== 'approved' : 'could not be checked',
      estimate_date: e.estimate_date,
      submitted_at: e.submitted_at?.slice(0, 10) ?? null,
      decision_at: e.decision_at?.slice(0, 10) ?? null,
      decision_method: e.decision_method,
      expiration_date: e.expiration_date,
      expired: Boolean(e.expiration_date && e.expiration_date < scope.today && OPEN_ESTIMATE_STATUSES.includes(e.status)),
      construction_total: formatMoney(e.construction_total_cents),
      total_with_land: formatMoney(e.total_with_land_cents),
      land_cost: e.land_cost_cents == null ? 'not recorded' : formatMoney(e.land_cost_cents),
      direct_cost: formatMoney(e.direct_cost_cents),
      allowances: formatMoney(e.allowance_cents),
      markup: formatMoney(e.markup_cents),
      contingency: formatMoney(e.contingency_cents),
    }
  })

  let lineItems: Record<string, unknown> | undefined
  if (number && shown.length === 1) {
    const { data: lines, error: lineError } = await scope.supabase
      .from('estimate_line_items')
      .select('category, description, quantity, unit, line_total_cents, is_allowance')
      .eq('estimate_id', shown[0].id)
      .order('sort_order')
      .limit(300)
    if (lineError) lineItems = { error: `Line items ${LOAD_FAILED}.` }
    else {
      const all = (lines ?? []) as { category: string; description: string; quantity: number | string; unit: string; line_total_cents: number; is_allowance: boolean }[]
      const byCategory = new Map<string, { count: number; cents: number }>()
      for (const l of all) {
        const c = byCategory.get(l.category) ?? { count: 0, cents: 0 }
        byCategory.set(l.category, { count: c.count + 1, cents: c.cents + l.line_total_cents })
      }
      const largest = [...all].sort((a, b) => b.line_total_cents - a.line_total_cents).slice(0, 12)
      lineItems = {
        line_count: all.length,
        category_totals: [...byCategory].map(([category, v]) => ({ category, lines: v.count, total: formatMoney(v.cents) })),
        largest_lines: largest.map((l) => ({
          description: l.description.slice(0, 120),
          category: l.category,
          quantity: `${l.quantity} ${l.unit}`,
          total: formatMoney(l.line_total_cents),
          allowance: l.is_allowance,
        })),
        ...(all.length === 300 ? { note: 'Only the first 300 line items were read.' } : {}),
      }
    }
  }

  return result(
    {
      scope: resolved.project ? `project ${resolved.project.name}` : 'all accessible projects',
      matching_estimates: matching.length,
      counts_by_approval_status: countsByStatus,
      estimates: records,
      ...(lineItems ? { line_items: lineItems } : {}),
      ...(moreNote(matching.length, shown.length) ? { partial: moreNote(matching.length, shown.length) } : {}),
    },
    links,
  )
}

// ---------------------------------------------------------------- Invoices

export const INVOICE_FILTERS = ['overdue', 'outstanding', 'all'] as const
const RECEIVABLE: InvoiceStatus[] = ['issued', 'partially_paid']

export async function loadInvoicesForAssistant(
  scope: RetrievalScope,
  input: { project?: string; filter: (typeof INVOICE_FILTERS)[number] },
): Promise<RetrievalResult> {
  if (!scope.features.invoices) return unavailable('Invoices are turned off for this company.')
  if (!scope.manager) return unavailable('Invoices and payments are limited to project managers and admins.')

  const resolved = await resolveProject(scope, input.project)
  if (resolved.problem) return result(resolved.problem)

  let query = scope.supabase
    .from('invoices')
    .select('id, invoice_number, title, status, invoice_date, due_date, total_cents, paid_cents, projects(name)')
    .eq('organization_id', scope.organizationId)
    .neq('status', 'voided')
    .order('due_date', { ascending: true })
    .limit(500)
  if (resolved.project) query = query.eq('project_id', resolved.project.id)
  const { data, error } = await query
  if (error) return result({ error: `Invoices ${LOAD_FAILED}.` })
  type Row = { id: string; invoice_number: string; title: string; status: InvoiceStatus; invoice_date: string; due_date: string; total_cents: number; paid_cents: number; projects: Ref<{ name: string }> }
  const rows = (data ?? []) as unknown as Row[]

  const receivable = rows.filter((r) => RECEIVABLE.includes(r.status))
  const overdue = receivable.filter((r) => r.due_date < scope.today)
  const sum = (list: Row[]) => list.reduce((s, r) => s + (r.total_cents - r.paid_cents), 0)
  const selected = input.filter === 'overdue' ? overdue : input.filter === 'outstanding' ? receivable : rows
  const shown = selected.slice(0, RECORD_LIMIT)

  const links: AssistantLink[] = []
  const records = shown.map((r, i) => {
    const key = `invoice_${i + 1}`
    links.push({ key, label: `Invoice ${r.invoice_number}`, href: `/invoices/${r.id}` })
    const isReceivable = RECEIVABLE.includes(r.status)
    return {
      link_key: key,
      invoice_number: r.invoice_number,
      title: r.title,
      project: one(r.projects)?.name ?? null,
      status: INVOICE_STATUS_LABELS[r.status],
      invoice_date: r.invoice_date,
      due_date: r.due_date,
      overdue: isReceivable && r.due_date < scope.today,
      days_past_due: isReceivable && r.due_date < scope.today ? Math.round((Date.parse(scope.today) - Date.parse(r.due_date)) / 86_400_000) : 0,
      total: formatMoney(r.total_cents),
      paid: formatMoney(r.paid_cents),
      balance: isReceivable ? formatMoney(r.total_cents - r.paid_cents) : r.status === 'paid' ? formatMoney(0) : 'not a receivable (draft)',
    }
  })

  return result(
    {
      scope: resolved.project ? `project ${resolved.project.name}` : 'all accessible projects',
      as_of: scope.today,
      summary: {
        outstanding_receivables: formatMoney(sum(receivable)),
        outstanding_invoice_count: receivable.length,
        overdue_balance: formatMoney(sum(overdue)),
        overdue_invoice_count: overdue.length,
        draft_invoice_count: rows.filter((r) => r.status === 'draft').length,
        note: 'Receivables are issued or partially paid invoices only. Drafts and voided invoices are excluded.',
      },
      invoices: records,
      ...(rows.length === 500 ? { partial: 'Only the first 500 invoices were read; totals may be incomplete.' } : {}),
      ...(moreNote(selected.length, shown.length) ? { partial_list: moreNote(selected.length, shown.length) } : {}),
    },
    links,
  )
}

// ---------------------------------------------------------------- Subcontractors

export async function loadSubcontractorsForAssistant(
  scope: RetrievalScope,
  input: { filter?: QualificationFilter; company?: string },
): Promise<RetrievalResult> {
  if (!scope.features.subcontractors) return unavailable('Subcontractors are turned off for this company.')
  if (!scope.manager) return unavailable('Subcontractor qualification details are limited to project managers and admins.')

  const name = cleanTerm(input.company)
  let query = scope.supabase
    .from('subcontractor_companies')
    .select('id, company_name, trade, status')
    .eq('organization_id', scope.organizationId)
    .order('company_name')
    .limit(name ? 10 : 1000)
  if (name) query = query.ilike('company_name', `%${escapeLike(name)}%`)
  const { data, error } = await query
  if (error) return result({ error: `Subcontractors ${LOAD_FAILED}.` })
  const companies = (data ?? []) as { id: string; company_name: string; trade: string | null; status: string | null }[]
  if (!companies.length) return result({ subcontractors: [], note: name ? `No subcontractor matches "${name}".` : 'No subcontractors are recorded.' })

  const qualification = await loadQualificationSummaries(scope.supabase, scope.organizationId, name ? companies.map((c) => c.id) : undefined)
  if (qualification.availability !== 'ready') {
    return result({
      qualification: qualification.availability === 'setup-required' ? 'Qualification tracking is not set up for this company.' : `Qualification ${LOAD_FAILED}.`,
    })
  }

  const filter = input.filter
  const matching = companies.filter((c) => !filter || matchesQualificationFilter(qualification.byCompany[c.id], filter))
  const shown = matching.slice(0, 20)
  const links: AssistantLink[] = []
  const records = shown.map((c, i) => {
    const s = qualification.byCompany[c.id]
    const key = `subcontractor_${i + 1}`
    links.push({ key, label: c.company_name.slice(0, 80), href: `/subcontractors/${c.id}` })
    return {
      link_key: key,
      company: c.company_name,
      trade: c.trade,
      company_account_status: c.status,
      qualification: s ? qualificationBadge(s).label : 'Not Started',
      required_items_satisfied: s ? `${s.mandatory_satisfied} of ${s.mandatory_total}` : 'not started',
      missing_required_items: s?.missing_count ?? null,
      rejected_items: s?.rejected_count ?? null,
      expired_items: s?.expired_count ?? null,
      awaiting_review: s?.awaiting_review_count ?? null,
      expiring_within_30_days: s?.expiring_soon_count ?? null,
      next_expiration: s?.next_expiration ?? null,
      next_required_action: nextRequiredAction(s ?? null, scope.today),
    }
  })

  return result(
    {
      filter: filter ? QUALIFICATION_FILTER_LABELS[filter] : 'all',
      assignment_mode: qualification.mode,
      matching_subcontractors: matching.length,
      subcontractors: records,
      note: 'company_account_status (for example Active) is the company record status, not qualification. Qualification comes only from verified requirements. Evidence files and item-level insurance or tax details are not available here; open the subcontractor record.',
      ...(moreNote(matching.length, shown.length) ? { partial: moreNote(matching.length, shown.length) } : {}),
    },
    links,
  )
}

// ---------------------------------------------------------------- Action Center

export async function loadActionCenterForAssistant(scope: RetrievalScope): Promise<RetrievalResult> {
  const f = scope.features
  const data = await getActionItems(scope.organizationId, scope.userId, {
    manager: scope.manager,
    features: {
      schedule: f.schedule,
      warranty: f.warranty,
      documents: f.documents,
      e_signatures: f.e_signatures,
      daily_logs: f.daily_logs,
      subcontractors: f.subcontractors,
      estimates: f.estimates,
      invoices: f.invoices,
      issues: f.issues,
    },
  })
  const items = scope.projectId ? data.items.filter((i) => i.projectId === scope.projectId) : data.items
  const shown = items.slice(0, RECORD_LIMIT)
  const counts: Record<string, number> = {}
  for (const item of items) counts[ACTION_CATEGORY_LABELS[item.category]] = (counts[ACTION_CATEGORY_LABELS[item.category]] ?? 0) + 1

  const links: AssistantLink[] = []
  const records = shown.map((item, i) => {
    const key = `action_${i + 1}`
    links.push({ key, label: item.actionLabel.slice(0, 80), href: item.href })
    return {
      link_key: key,
      title: item.title,
      detail: item.description,
      category: ACTION_CATEGORY_LABELS[item.category],
      severity: item.severity,
      project: item.projectName,
      due_date: item.dueDate,
      next_step: item.actionLabel,
      resolves_when: item.resolutionCondition,
    }
  })

  return result(
    {
      scope: scope.projectId ? 'open project' : 'all accessible projects',
      total_actions: items.length,
      ...(data.totalIsLowerBound && !scope.projectId ? { total_is_lower_bound: true } : {}),
      counts_by_category: counts,
      actions: records,
      ...(data.unavailable.length ? { not_checked: data.unavailable.map((u) => `${u.module}: ${u.detail}`) } : {}),
      ...(moreNote(items.length, shown.length) ? { partial: moreNote(items.length, shown.length) } : {}),
    },
    links,
  )
}

// ---------------------------------------------------------------- Completion readiness

export async function loadCompletionReadinessForAssistant(scope: RetrievalScope, input: { project?: string }): Promise<RetrievalResult> {
  const resolved = await resolveProject(scope, input.project)
  if (resolved.problem) return result(resolved.problem)
  if (!resolved.project) return result({ instruction: 'No project is open. Ask which project to check, by name or number.' })
  const project = resolved.project

  const { data: internal, error } = await scope.supabase.rpc('can_view_project_internal', { p_project: project.id })
  if (error) return result({ error: `Project access ${LOAD_FAILED}.` })
  if (!internal) return unavailable('Completion readiness for this project is limited to its internal team.')

  const f = scope.features
  const summary = await loadCompletionReadiness(
    scope.supabase,
    project.id,
    { schedule: f.schedule, walkthroughs: f.walkthroughs, documents: f.documents, e_signatures: f.e_signatures, invoices: f.invoices, warranty: f.warranty },
    scope.manager,
  )
  const links: AssistantLink[] = [{ key: 'project_completion_review', label: 'Completion review', href: `/projects/${project.id}/complete` }]
  const describe = (i: (typeof summary.items)[number]) => ({ item: i.label, detail: i.detail, policy: i.policy })

  return result(
    {
      project: project.name,
      project_status: project.status ?? null,
      overall: summary.overall,
      overall_meaning:
        summary.overall === 'ready'
          ? 'All applicable closeout requirements are verified.'
          : summary.overall === 'needs_exceptions'
            ? 'Only overridable items remain; a manager can record approved exceptions in the completion review.'
            : 'Required items are unmet and cannot be waived.',
      requirements_satisfied: `${summary.satisfiedCount} of ${summary.applicableCount}`,
      blockers: summary.blockers.map(describe),
      cannot_be_waived: summary.hardBlockers.map((i) => i.label),
      warnings: summary.warnings.map(describe),
      next_action: summary.nextAction ? describe(summary.nextAction) : null,
      link_key: 'project_completion_review',
    },
    links,
  )
}
