import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { FeatureMap } from '@/lib/feature-registry'
import type { OrgRole } from '@/lib/domain'
import { isOverdue, todayIso, type ActivityStatus } from '@/lib/schedule'
import { OPEN_STATUSES } from '@/lib/signatures'
import { getProjectNavItems } from '@/lib/project-nav'
import { navForRole } from '@/lib/navigation'
import type { AssistantLink, AssistantModule } from '@/lib/ai/assistant-scope'

const clip = (value: unknown, max = 280) =>
  typeof value === 'string' ? (value.length > max ? `${value.slice(0, max)}…` : value) : value

const dollars = (cents: number | null | undefined) => (cents == null ? null : Math.round(cents) / 100)

export type AssistantRequestScope = {
  organizationId: string
  role: OrgRole
  projectId: string | null
  /** Untrusted page hint; it only shifts emphasis and never widens what is loaded beyond the user's access. */
  module: AssistantModule | null
  question: string
}

export type AssistantContext = { data: Record<string, unknown>; links: AssistantLink[] }

const DOCUMENT_QUESTION = /\b(documents?|docs?|files?|contracts?|permits?|plans?|drawings?|sign(ed|ing|atures?)?|pdfs?)\b/i
const SCHEDULE_ACTIVITY_LIMIT = 80

/**
 * Builds the read-only data block sent to the model plus the allowlisted links it may reference.
 * Every query runs through the signed-in user's RLS-scoped client and is pinned to their
 * organization, so the assistant can never see more than the user could open in the app.
 * Modules turned off for the organization are skipped. Returns null when a requested project
 * is not accessible.
 */
export async function buildAssistantContext(
  supabase: SupabaseClient,
  features: FeatureMap,
  scope: AssistantRequestScope,
): Promise<AssistantContext | null> {
  const today = todayIso()
  const { projectId, question, module: pageModule } = scope
  if (!projectId) {
    const { data, links } = await portfolio(supabase, features, scope, today)
    return { data: { today, scope: 'portfolio', current_page: pageModule ?? 'other', ...data }, links }
  }

  const [{ data: project, error: projectError }, { data: canViewInternal }] = await Promise.all([
    supabase
      .from('projects')
      .select(
        'id, project_number, name, primary_client_id, project_manager_id, project_type, status, progress_percent, city, state, community, phase, lot, block, proposed_start_date, target_completion_date, completion_date, estimated_budget_cents, description',
      )
      .eq('id', projectId)
      .eq('organization_id', scope.organizationId)
      .is('archived_at', null)
      .maybeSingle(),
    supabase.rpc('can_view_project_internal', { p_project: projectId }),
  ])
  if (projectError) throw new AssistantContextError(`project query failed: ${projectError.message}`)
  if (!project) return null

  const documentsAllowed = Boolean(features.documents && canViewInternal)
  const wantsDocuments = documentsAllowed && (pageModule === 'documents' || DOCUMENT_QUESTION.test(question))

  const [clientLinks, team, schedule, estimates, issues, warranty, documents] = await Promise.all([
    clientRelationshipsFor(supabase, [project], true),
    teamFor(supabase, project),
    features.schedule
      ? supabase
          .from('schedule_activities')
          .select('name, phase, status, planned_start, planned_end, actual_start, actual_end, percent_complete, delay_reason')
          .eq('project_id', projectId)
          .order('sort_order')
          .limit(SCHEDULE_ACTIVITY_LIMIT)
      : null,
    features.estimates
      ? supabase
          .from('estimates')
          .select('estimate_number, name, revision, status, estimate_date, expiration_date, construction_total_cents, total_with_land_cents, decision_at')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false })
          .limit(8)
      : null,
    features.issues
      ? supabase
          .from('project_issues')
          .select('category, item_label, status, priority, due_date, homeowner_description, reported_at')
          .eq('project_id', projectId)
          .in('status', ['open', 'in_progress'])
          .order('reported_at', { ascending: false })
          .limit(25)
      : null,
    features.warranty ? warrantyFor(supabase, projectId) : null,
    wantsDocuments ? documentsFor(supabase, projectId, Boolean(features.e_signatures)) : null,
  ])

  const navItems = getProjectNavItems(project.id, {
    features,
    projectStatus: project.status,
    canViewInternal: Boolean(canViewInternal),
  })
  const links: AssistantLink[] = navItems.map((item) => ({
    key: `project_${item.key}`,
    label: item.key === 'overview' ? `Open ${project.name}` : `Open ${item.label}`,
    href: item.href,
  }))

  return {
    links,
    data: {
      today,
      scope: 'project',
      current_page: pageModule ?? 'other',
      project: {
        ...project,
        description: clip(project.description, 600),
        estimated_budget: dollars(project.estimated_budget_cents),
        estimated_budget_cents: undefined,
        primary_client_id: undefined,
        project_manager_id: undefined,
      },
      homeowners_and_contacts: clientLinks.get(project.id) ?? LOAD_FAILED,
      team,
      schedule: schedule ? (schedule.error ? LOAD_FAILED : summarizeSchedule(schedule.data ?? [], today)) : 'module turned off',
      documents: !features.documents
        ? 'module turned off'
        : !documentsAllowed
          ? 'not available to this user'
          : (documents ?? 'not loaded for this question; ask about documents to see them'),
      available_links: links.map(({ key, label }) => ({ key, label })),
      estimates: estimates
      ? estimates.error
        ? LOAD_FAILED
        : (estimates.data ?? []).map((e) => ({
          ...e,
          construction_total: dollars(e.construction_total_cents),
          total_with_land: dollars(e.total_with_land_cents),
          construction_total_cents: undefined,
          total_with_land_cents: undefined,
        }))
      : 'module turned off',
    open_punch_list_issues: issues
      ? issues.error
        ? LOAD_FAILED
        : (issues.data ?? []).map((i) => ({ ...i, homeowner_description: clip(i.homeowner_description) }))
      : 'module turned off',
      warranty: warranty ?? 'module turned off',
    },
  }
}

type ActivityRow = {
  name: string
  phase: string | null
  status: ActivityStatus
  planned_start: string | null
  planned_end: string | null
  actual_start: string | null
  actual_end: string | null
  percent_complete: number | null
  delay_reason: string | null
}

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Flags overdue work with the app's own definition so the model never computes it from dates itself. */
function summarizeSchedule(rows: ActivityRow[], today: string) {
  const horizon = addDays(today, 14)
  const open = (a: ActivityRow) => a.status !== 'completed' && a.status !== 'skipped'
  const activities = rows.map((a) => ({ ...a, delay_reason: clip(a.delay_reason, 200), overdue: isOverdue(a, today) }))
  return {
    overdue_definition: 'planned_end is before today and the activity is not completed or not applicable',
    totals: {
      activities: rows.length,
      completed: rows.filter((a) => a.status === 'completed').length,
      in_progress: rows.filter((a) => a.status === 'in_progress').length,
      delayed: rows.filter((a) => a.status === 'delayed').length,
      overdue: activities.filter((a) => a.overdue).length,
    },
    upcoming_next_14_days: rows
      .filter((a) => open(a) && a.planned_start && a.planned_start >= today && a.planned_start <= horizon)
      .map((a) => ({ name: a.name, planned_start: a.planned_start, planned_end: a.planned_end })),
    ...(rows.length >= SCHEDULE_ACTIVITY_LIMIT ? { note: `Only the first ${SCHEDULE_ACTIVITY_LIMIT} activities are included.` } : {}),
    activities,
  }
}

/**
 * The assigned project manager and project members, by display name only.
 * A user id with no readable profile is reported as restricted rather than missing.
 */
async function teamFor(supabase: SupabaseClient, project: { id: string; project_manager_id: string | null }) {
  const { data: members, error } = await supabase
    .from('project_members')
    .select('user_id, project_role')
    .eq('project_id', project.id)
    .order('created_at')
  if (error) return LOAD_FAILED
  const ids = [...new Set([project.project_manager_id, ...(members ?? []).map((m) => m.user_id)].filter((v): v is string => Boolean(v)))]
  const names = await profileNames(supabase, ids)
  if (!names) return LOAD_FAILED
  const nameOf = (id: string) => names.get(id) ?? 'team member (name not available to this user)'
  return {
    project_manager: project.project_manager_id ? nameOf(project.project_manager_id) : 'no project manager is assigned',
    team_members: (members ?? [])
      .filter((m) => m.user_id !== project.project_manager_id)
      .map((m) => ({ name: nameOf(m.user_id), project_role: m.project_role })),
  }
}

async function profileNames(supabase: SupabaseClient, ids: string[]): Promise<Map<string, string> | null> {
  if (!ids.length) return new Map()
  const res = await selectByIds<{ id: string; full_name: string | null }>(ids, (chunk) =>
    supabase.from('profiles').select('id, full_name').in('id', chunk),
  )
  if (!res.rows) return null
  return new Map(res.rows.filter((p) => p.full_name?.trim()).map((p) => [p.id, p.full_name!.trim()]))
}

/** Active project documents with the latest signature status, read through RLS. Fetched only when asked about. */
async function documentsFor(supabase: SupabaseClient, projectId: string, signaturesOn: boolean) {
  const { data: docs, error } = await supabase
    .from('project_documents')
    .select('id, name, category, visibility, current_version_number, updated_at')
    .eq('project_id', projectId)
    .eq('scope', 'project')
    .is('archived_at', null)
    .order('updated_at', { ascending: false })
    .limit(40)
  if (error) return LOAD_FAILED
  const rows = docs ?? []
  const latest = new Map<string, string>()
  let signatureError = false
  if (rows.length) {
    const { data: requests, error: reqError } = await supabase
      .from('signature_requests')
      .select('document_id, status, created_at')
      .in('document_id', rows.map((d) => d.id))
      .order('created_at', { ascending: false })
    if (reqError) signatureError = true
    for (const r of requests ?? []) if (!latest.has(r.document_id)) latest.set(r.document_id, r.status)
  }
  const pending = [...latest.values()].filter((s) => (OPEN_STATUSES as string[]).includes(s)).length
  return {
    total_listed: rows.length,
    ...(rows.length >= 40 ? { note: 'Only the 40 most recently updated documents are included.' } : {}),
    signatures: signatureError
      ? LOAD_FAILED
      : { electronic_signatures_enabled: signaturesOn, pending_signature_requests: pending },
    items: rows.map(({ id, visibility, ...d }) => ({
      ...d,
      name: clip(d.name, 160),
      shared_with_homeowner: visibility === 'homeowner',
      latest_signature_status: signatureError ? LOAD_FAILED : (latest.get(id) ?? 'none'),
    })),
  }
}

const LOAD_FAILED = 'could not be loaded right now; do not guess'
const RESTRICTED = 'linked, but this user is not authorized to view this client record'
const NO_CLIENT = 'no client is linked to this project'
const ID_CHUNK = 150

type ProjectRef = { id: string; primary_client_id: string | null }
type ClientRow = {
  id: string
  first_name: string | null
  last_name: string | null
  company_name: string | null
  archived_at: string | null
  portal_user_id: string | null
}
type ContactRow = {
  client_id: string
  first_name: string | null
  last_name: string | null
  relationship: string | null
  is_primary: boolean
  portal_enabled: boolean | null
}
type QueryResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

async function selectByIds<T>(ids: string[], run: (chunk: string[]) => QueryResult<T>) {
  const rows: T[] = []
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const { data, error } = await run(ids.slice(i, i + ID_CHUNK))
    if (error) return { rows: null, error: error.message }
    rows.push(...(data ?? []))
  }
  return { rows, error: null }
}

const personName = (r: { first_name: string | null; last_name: string | null; company_name?: string | null }) =>
  [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || r.company_name || 'Unnamed record'

/**
 * Resolves each project's linked clients through project_clients and projects.primary_client_id,
 * using the caller's RLS-scoped client. Only names, relationship labels, and portal flags are
 * returned; emails, phones, and notes never leave the server. Each project resolves to a list of
 * linked clients, NO_CLIENT, or LOAD_FAILED, and clients the user cannot read are marked RESTRICTED
 * so a permission gap is never reported as a missing homeowner.
 */
async function clientRelationshipsFor(
  supabase: SupabaseClient,
  projects: ProjectRef[],
  includeContacts: boolean,
): Promise<Map<string, unknown>> {
  const result = new Map<string, unknown>()
  if (!projects.length) return result
  const fail = () => {
    for (const p of projects) result.set(p.id, LOAD_FAILED)
    return result
  }

  const links = await selectByIds<{ project_id: string; client_id: string; relationship: string | null }>(
    projects.map((p) => p.id),
    (chunk) => supabase.from('project_clients').select('project_id, client_id, relationship').in('project_id', chunk).order('created_at'),
  )
  if (!links.rows) return fail()

  const linksBy = new Map<string, { client_id: string; relationship: string | null }[]>()
  for (const l of links.rows) linksBy.set(l.project_id, [...(linksBy.get(l.project_id) ?? []), l])
  for (const p of projects) {
    const list = linksBy.get(p.id) ?? []
    if (p.primary_client_id && !list.some((l) => l.client_id === p.primary_client_id)) {
      list.unshift({ client_id: p.primary_client_id, relationship: 'primary_owner' })
    }
    linksBy.set(p.id, list)
  }

  const clientIds = [...new Set([...linksBy.values()].flat().map((l) => l.client_id))]
  if (!clientIds.length) {
    for (const p of projects) result.set(p.id, NO_CLIENT)
    return result
  }

  const [clients, contacts] = await Promise.all([
    selectByIds<ClientRow>(clientIds, (chunk) =>
      supabase.from('clients').select('id, first_name, last_name, company_name, archived_at, portal_user_id').in('id', chunk),
    ),
    includeContacts
      ? selectByIds<ContactRow>(clientIds, (chunk) =>
          supabase
            .from('client_contacts')
            .select('client_id, first_name, last_name, relationship, is_primary, portal_enabled')
            .in('client_id', chunk)
            .is('archived_at', null)
            .order('is_primary', { ascending: false })
            .order('created_at'),
        )
      : null,
  ])
  if (!clients.rows) return fail()

  const clientBy = new Map(clients.rows.map((c) => [c.id, c]))
  const contactsBy = new Map<string, ContactRow[]>()
  for (const c of contacts?.rows ?? []) contactsBy.set(c.client_id, [...(contactsBy.get(c.client_id) ?? []), c])

  for (const p of projects) {
    const list = linksBy.get(p.id) ?? []
    if (!list.length) {
      result.set(p.id, NO_CLIENT)
      continue
    }
    const primaryId = p.primary_client_id ?? list.find((l) => l.relationship === 'primary_owner')?.client_id ?? null
    result.set(
      p.id,
      list.map((link) => {
        const role = link.client_id === primaryId ? 'primary homeowner (client of record)' : `additional linked client (${link.relationship ?? 'other'})`
        const client = clientBy.get(link.client_id)
        if (!client) return { role, record: RESTRICTED }
        return {
          role,
          name: personName(client),
          ...(client.archived_at ? { client_record_archived: true } : {}),
          client_has_portal_login: Boolean(client.portal_user_id),
          ...(includeContacts
            ? {
                contacts: contacts?.error
                  ? LOAD_FAILED
                  : (contactsBy.get(link.client_id) ?? []).map((ct) => ({
                      name: personName(ct),
                      relationship_to_client: ct.relationship,
                      primary_contact: ct.is_primary,
                      portal_access_enabled: Boolean(ct.portal_enabled),
                    })),
              }
            : {}),
        }
      }),
    )
  }
  return result
}

/** Projects the question names by project number or a distinctive word of the project name. */
function projectsMentioned<T extends { project_number: string | null; name: string }>(list: T[], question: string, max = 5) {
  const q = question.toLowerCase()
  const words = new Set(q.match(/[a-z0-9]{4,}/g) ?? [])
  const byNumber = list.filter((p) => p.project_number && new RegExp(`\\b${p.project_number.toLowerCase().replace(/[^a-z0-9]/g, '\\$&')}\\b`).test(q))
  const byName = list.filter(
    (p) => !byNumber.includes(p) && (q.includes(p.name.toLowerCase()) || (p.name.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []).some((w) => words.has(w))),
  )
  return [...byNumber, ...byName].slice(0, max)
}

async function warrantyFor(supabase: SupabaseClient, projectId: string) {
  const [enrollmentResult, claimResult] = await Promise.all([
    supabase
      .from('project_warranties')
      .select('stage, start_date, activated_at, archived_at')
      .eq('project_id', projectId)
      .is('archived_at', null)
      .limit(3),
    supabase
      .from('warranty_claims')
      .select('title, category, location, status, coverage_decision, reported_at, homeowner_validation, submitted_after_coverage')
      .eq('project_id', projectId)
      .neq('status', 'closed')
      .order('reported_at', { ascending: false })
      .limit(20),
  ])
  return {
    enrollments: enrollmentResult.error ? LOAD_FAILED : enrollmentResult.data ?? [],
    open_claims: claimResult.error
      ? LOAD_FAILED
      : (claimResult.data ?? []).map((c) => ({ ...c, title: clip(c.title, 160) })),
  }
}

const PORTFOLIO_PAGE_SIZE = 200
const PORTFOLIO_MAX_PROJECTS = 600
const PORTFOLIO_COLUMNS =
  'id, project_number, name, primary_client_id, project_manager_id, status, progress_percent, city, community, target_completion_date, completion_date'

type PortfolioProject = {
  id: string
  primary_client_id: string | null
  project_manager_id: string | null
  project_number: string | null
  name: string
  status: string
  progress_percent: number | null
  city: string | null
  community: string | null
  target_completion_date: string | null
  completion_date: string | null
}

/** Thrown when core records cannot be loaded, so the assistant never mistakes a failure for absence. */
export class AssistantContextError extends Error {}

/**
 * Loads every non-archived project the user's RLS policy allows, across all lifecycle
 * statuses, paging through results. For very large portfolios the list is capped and
 * projects named in the question are fetched with a targeted lookup instead.
 */
async function loadAccessibleProjects(supabase: SupabaseClient, question: string) {
  const projects: PortfolioProject[] = []
  let total: number | null = null
  for (let from = 0; from < PORTFOLIO_MAX_PROJECTS; from += PORTFOLIO_PAGE_SIZE) {
    const to = Math.min(from + PORTFOLIO_PAGE_SIZE, PORTFOLIO_MAX_PROJECTS) - 1
    const { data, error, count } = await supabase
      .from('projects')
      .select(PORTFOLIO_COLUMNS, from === 0 ? { count: 'exact' } : undefined)
      .is('archived_at', null)
      .order('project_number', { ascending: true, nullsFirst: false })
      .order('id', { ascending: true })
      .range(from, to)
    if (error) throw new AssistantContextError(`projects query failed: ${error.message}`)
    if (from === 0) total = count ?? null
    projects.push(...((data ?? []) as PortfolioProject[]))
    if (!data || data.length < to - from + 1) break
  }

  const truncated = total != null && total > projects.length
  if (truncated) {
    const known = new Set(projects.map((p) => p.id))
    for (const match of await searchProjects(supabase, question)) {
      if (!known.has(match.id)) {
        known.add(match.id)
        projects.push(match)
      }
    }
  }
  return { projects, total: total ?? projects.length, truncated }
}

async function searchProjects(supabase: SupabaseClient, question: string): Promise<PortfolioProject[]> {
  const numbers = [...new Set(question.toUpperCase().match(/\b[A-Z]{1,4}-\d{2,6}\b/g) ?? [])].slice(0, 5)
  const words = [...new Set(question.toLowerCase().match(/[a-z0-9]{4,}/g) ?? [])]
    .sort((a, b) => b.length - a.length)
    .slice(0, 4)
  const lookups = [
    ...numbers.map((n) => supabase.from('projects').select(PORTFOLIO_COLUMNS).is('archived_at', null).ilike('project_number', n).limit(5)),
    ...words.map((w) => supabase.from('projects').select(PORTFOLIO_COLUMNS).is('archived_at', null).ilike('name', `%${w}%`).limit(10)),
  ]
  const results = await Promise.all(lookups)
  const failed = results.find((r) => r.error)
  if (failed?.error) throw new AssistantContextError(`project search failed: ${failed.error.message}`)
  return results.flatMap((r) => (r.data ?? []) as PortfolioProject[])
}

async function portfolio(
  supabase: SupabaseClient,
  features: FeatureMap,
  scope: AssistantRequestScope,
  today: string,
): Promise<{ data: Record<string, unknown>; links: AssistantLink[] }> {
  const { question } = scope
  const { projects: list, total, truncated } = await loadAccessibleProjects(supabase, question)
  const pageLinks: AssistantLink[] = navForRole(scope.role, features)
    .filter((item) => ['/dashboard', '/projects', '/schedule', '/estimates', '/warranty'].includes(item.href))
    .map((item) => ({ key: `page_${item.href.slice(1)}`, label: `Open ${item.label}`, href: item.href }))
  const { data, linkable } = await portfolioData(supabase, features, list, total, truncated, question, today)
  const projectLinks = linkable.map((p) => ({
    key: `project_${(p.project_number ?? p.id).toLowerCase()}`,
    label: `Open ${p.name}`,
    href: `/projects/${p.id}`,
  }))
  const links = [...pageLinks, ...projectLinks]
  return { data: { ...data, available_links: links.map(({ key, label }) => ({ key, label })) }, links }
}

/** Projects worth a direct link: the ones named in the question, then the ones showing attention signals. */
const MAX_PROJECT_LINKS = 12

async function portfolioData(
  supabase: SupabaseClient,
  features: FeatureMap,
  list: PortfolioProject[],
  total: number,
  truncated: boolean,
  question: string,
  today: string,
): Promise<{ data: Record<string, unknown>; linkable: PortfolioProject[] }> {
  const ids = list.map((p) => p.id)
  const coverage = {
    accessible_project_count: total,
    projects_included: list.length,
    complete_list: !truncated,
    note: truncated
      ? 'Only part of the accessible portfolio is included. Projects not listed may still exist; ask the user to select the project or check the Projects page.'
      : 'This is every non-archived project the user is authorized to view, in all statuses.',
  }
  if (!ids.length) return { data: { project_coverage: coverage, projects: [] }, linkable: [] }

  const mentioned = projectsMentioned(list, question)
  const mentionedIds = new Set(mentioned.map((p) => p.id))
  const managerIds = [...new Set(list.map((p) => p.project_manager_id).filter((v): v is string => Boolean(v)))]
  const [homeownerNames, homeownerDetails, managers, late, issues, claims, warranties] = await Promise.all([
    clientRelationshipsFor(supabase, list.filter((p) => !mentionedIds.has(p.id)), false),
    clientRelationshipsFor(supabase, mentioned, true),
    profileNames(supabase, managerIds),
    features.schedule
      ? supabase
          .from('schedule_activities')
          .select('project_id, name, planned_end, status')
          .in('project_id', ids)
          .lt('planned_end', today)
          .not('status', 'in', '(completed,skipped)')
          .limit(500)
      : null,
    features.issues
      ? supabase.from('project_issues').select('project_id').in('project_id', ids).in('status', ['open', 'in_progress']).limit(500)
      : null,
    features.warranty
      ? supabase.from('warranty_claims').select('project_id').in('project_id', ids).neq('status', 'closed').limit(2000)
      : null,
    features.warranty
      ? supabase.from('project_warranties').select('project_id, stage, start_date').in('project_id', ids).is('archived_at', null).limit(2000)
      : null,
  ])

  const unavailable: string[] = []
  const usable = <T,>(result: { data: T[] | null; error: unknown } | null, label: string) => {
    if (!result) return null
    if (result.error) {
      unavailable.push(label)
      return null
    }
    return result.data ?? []
  }
  const lateRows = usable(late, 'overdue schedule activity counts')
  const issueRows = usable(issues, 'open punch list issue counts')
  const claimRows = usable(claims, 'open warranty claim counts')
  const warrantyRows = usable(warranties, 'warranty stages')

  const countBy = (rows: { project_id: string }[]) => {
    const m = new Map<string, number>()
    for (const r of rows) m.set(r.project_id, (m.get(r.project_id) ?? 0) + 1)
    return m
  }
  const lateBy = lateRows && countBy(lateRows)
  const issueBy = issueRows && countBy(issueRows)
  const claimBy = claimRows && countBy(claimRows)
  const warrantyBy = new Map((warrantyRows ?? []).map((w) => [w.project_id, { stage: w.stage, start_date: w.start_date }]))

  if (!managers) unavailable.push('project manager names')
  const needsAttention = (id: string) => (lateBy?.get(id) ?? 0) > 0 || (issueBy?.get(id) ?? 0) > 0 || (claimBy?.get(id) ?? 0) > 0
  const linkable = [...mentioned, ...list.filter((p) => !mentionedIds.has(p.id) && needsAttention(p.id))].slice(0, MAX_PROJECT_LINKS)

  return {
    linkable,
    data: {
      project_coverage: coverage,
      ...(unavailable.length ? { data_load_errors: unavailable.map((l) => `${l} could not be loaded; do not guess them`) } : {}),
      projects: list.map(({ id, primary_client_id: _primaryClientId, project_manager_id: managerId, ...p }) => ({
        ...p,
        project_manager: !managerId ? 'none assigned' : !managers ? LOAD_FAILED : (managers.get(managerId) ?? 'name not available to this user'),
        homeowners_and_contacts: homeownerDetails.get(id) ?? homeownerNames.get(id) ?? LOAD_FAILED,
        ...(lateBy ? { overdue_activities: lateBy.get(id) ?? 0 } : {}),
        ...(issueBy ? { open_punch_list_issues: issueBy.get(id) ?? 0 } : {}),
        ...(claimBy ? { open_warranty_claims: claimBy.get(id) ?? 0 } : {}),
        ...(warrantyRows ? { warranty: warrantyBy.get(id) ?? 'not enrolled' } : {}),
      })),
    },
  }
}
