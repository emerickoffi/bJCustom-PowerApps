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
): Promise<Record<string, unknown> | null> {
  const today = new Date().toISOString().slice(0, 10)
  if (!projectId) return { today, scope: 'portfolio', ...(await portfolio(supabase, features)) }

  const { data: project } = await supabase
    .from('projects')
    .select(
      'id, project_number, name, project_type, status, progress_percent, city, state, community, phase, lot, block, proposed_start_date, target_completion_date, completion_date, estimated_budget_cents, description',
    )
    .eq('id', projectId)
    .is('archived_at', null)
    .maybeSingle()
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
    schedule: schedule ? schedule.data ?? [] : 'module turned off',
    estimates: estimates
      ? (estimates.data ?? []).map((e) => ({
          ...e,
          construction_total: dollars(e.construction_total_cents),
          total_with_land: dollars(e.total_with_land_cents),
          construction_total_cents: undefined,
          total_with_land_cents: undefined,
        }))
      : 'module turned off',
    open_punch_list_issues: issues
      ? (issues.data ?? []).map((i) => ({ ...i, homeowner_description: clip(i.homeowner_description) }))
      : 'module turned off',
    warranty: warranty ?? 'module turned off',
  }
}

async function warrantyFor(supabase: SupabaseClient, projectId: string) {
  const [{ data: enrollments }, { data: claims }] = await Promise.all([
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
  return { enrollments: enrollments ?? [], open_claims: (claims ?? []).map((c) => ({ ...c, title: clip(c.title, 160) })) }
}

async function portfolio(supabase: SupabaseClient, features: FeatureMap) {
  const { data: projects } = await supabase
    .from('projects')
    .select('id, project_number, name, status, progress_percent, city, target_completion_date')
    .is('archived_at', null)
    .not('status', 'in', '(completed,cancelled)')
    .order('updated_at', { ascending: false })
    .limit(30)
  const list = projects ?? []
  const ids = list.map((p) => p.id)
  if (!ids.length) return { active_projects: [] }

  const today = new Date().toISOString().slice(0, 10)
  const [late, issues, claims] = await Promise.all([
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
      ? supabase.from('warranty_claims').select('project_id').in('project_id', ids).neq('status', 'closed').limit(500)
      : null,
  ])

  const countBy = (rows: { project_id: string }[] | null | undefined) => {
    const m = new Map<string, number>()
    for (const r of rows ?? []) m.set(r.project_id, (m.get(r.project_id) ?? 0) + 1)
    return m
  }
  const lateBy = countBy(late?.data)
  const issueBy = countBy(issues?.data)
  const claimBy = countBy(claims?.data)

  return {
    active_projects: list.map(({ id, ...p }) => ({
      ...p,
      ...(late ? { overdue_activities: lateBy.get(id) ?? 0 } : {}),
      ...(issues ? { open_punch_list_issues: issueBy.get(id) ?? 0 } : {}),
      ...(claims ? { open_warranty_claims: claimBy.get(id) ?? 0 } : {}),
    })),
  }
}
