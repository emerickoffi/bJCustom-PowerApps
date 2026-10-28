import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { FeatureMap } from '@/lib/feature-registry'

const clip = (value: unknown, max = 280) =>
  typeof value === 'string' ? (value.length > max ? `${value.slice(0, max)}…` : value) : value

const dollars = (cents: number | null | undefined) => (cents == null ? null : Math.round(cents) / 100)

/**
 * Builds the read-only data block sent to the model. Every query runs through the
 * signed-in user's RLS-scoped client, so the assistant can never see more than the
 * user could open in the app. Modules turned off for the organization are skipped.
 * Returns null when a requested project is not accessible.
 */
export async function buildAssistantContext(
  supabase: SupabaseClient,
  features: FeatureMap,
  projectId: string | null,
  question = '',
): Promise<Record<string, unknown> | null> {
  const today = new Date().toISOString().slice(0, 10)
  if (!projectId) return { today, scope: 'portfolio', ...(await portfolio(supabase, features, question)) }

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select(
      'id, project_number, name, project_type, status, progress_percent, city, state, community, phase, lot, block, proposed_start_date, target_completion_date, completion_date, estimated_budget_cents, description',
    )
    .eq('id', projectId)
    .is('archived_at', null)
    .maybeSingle()
  if (projectError) throw new AssistantContextError(`project query failed: ${projectError.message}`)
  if (!project) return null

  const [schedule, estimates, issues, warranty] = await Promise.all([
    features.schedule
      ? supabase
          .from('schedule_activities')
          .select('name, phase, status, planned_start, planned_end, actual_start, actual_end, percent_complete, delay_reason')
          .eq('project_id', projectId)
          .order('sort_order')
          .limit(80)
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
  ])

  return {
    today,
    scope: 'project',
    project: {
      ...project,
      description: clip(project.description, 600),
      estimated_budget: dollars(project.estimated_budget_cents),
      estimated_budget_cents: undefined,
    },
    schedule: schedule ? (schedule.error ? LOAD_FAILED : schedule.data ?? []) : 'module turned off',
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
  }
}

const LOAD_FAILED = 'could not be loaded right now; do not guess'

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
  'id, project_number, name, status, progress_percent, city, community, target_completion_date, completion_date'

type PortfolioProject = {
  id: string
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

async function portfolio(supabase: SupabaseClient, features: FeatureMap, question: string) {
  const { projects: list, total, truncated } = await loadAccessibleProjects(supabase, question)
  const ids = list.map((p) => p.id)
  const coverage = {
    accessible_project_count: total,
    projects_included: list.length,
    complete_list: !truncated,
    note: truncated
      ? 'Only part of the accessible portfolio is included. Projects not listed may still exist; ask the user to select the project or check the Projects page.'
      : 'This is every non-archived project the user is authorized to view, in all statuses.',
  }
  if (!ids.length) return { project_coverage: coverage, projects: [] }

  const today = new Date().toISOString().slice(0, 10)
  const [late, issues, claims, warranties] = await Promise.all([
    features.schedule
      ? supabase
          .from('schedule_activities')
          .select('project_id, name, planned_end, status')
          .in('project_id', ids)
          .lt('planned_end', today)
          .is('actual_end', null)
          .limit(200)
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

  return {
    project_coverage: coverage,
    ...(unavailable.length ? { data_load_errors: unavailable.map((l) => `${l} could not be loaded; do not guess them`) } : {}),
    projects: list.map(({ id, ...p }) => ({
      ...p,
      ...(lateBy ? { overdue_activities: lateBy.get(id) ?? 0 } : {}),
      ...(issueBy ? { open_punch_list_issues: issueBy.get(id) ?? 0 } : {}),
      ...(claimBy ? { open_warranty_claims: claimBy.get(id) ?? 0 } : {}),
      ...(warrantyRows ? { warranty: warrantyBy.get(id) ?? 'not enrolled' } : {}),
    })),
  }
}
