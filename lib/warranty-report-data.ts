import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { getStaffMembers } from '@/lib/queries'
import { addDaysIso } from '@/lib/warranty-coverage'
import { orgToday } from '@/lib/schedule-report-data'
import { buildWarrantyReport, COVERAGE_WINDOW_DAYS, FOLLOWUP_WINDOW_DAYS, type WarrantyReport } from '@/lib/warranty-report'

type ProjectRef = { name: string } | null

/** Everything the warranty report shows, read through RLS with the signed-in manager's session. */
export async function loadWarrantyReport(organizationId: string): Promise<WarrantyReport> {
  const supabase = await createClient()
  const today = await orgToday(organizationId)
  const [claims, coverage, followups, homes, staff] = await Promise.all([
    supabase
      .from('warranty_claims')
      .select('id, project_id, title, category, location, status, reported_at, updated_at, assigned_to, projects(name)')
      .eq('organization_id', organizationId)
      .neq('status', 'closed')
      .limit(5000),
    supabase
      .from('warranty_milestones')
      .select('project_id, coverage_name, due_on, project_warranties!warranty_milestones_warranty_id_fkey!inner(stage, projects(name))')
      .eq('organization_id', organizationId)
      .is('reached_at', null)
      .neq('project_warranties.stage', 'archived')
      .gte('due_on', today)
      .lte('due_on', addDaysIso(today, COVERAGE_WINDOW_DAYS))
      .limit(5000),
    supabase
      .from('warranty_followup_tasks')
      .select('id, project_id, status, projects(name), warranty_milestones!inner(coverage_name, due_on)')
      .eq('organization_id', organizationId)
      .neq('status', 'sent')
      .lte('warranty_milestones.due_on', addDaysIso(today, FOLLOWUP_WINDOW_DAYS))
      .limit(5000),
    supabase.from('project_warranties').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).neq('stage', 'archived'),
    getStaffMembers(organizationId),
  ])
  const failed = [claims, coverage, followups, homes].find((r) => r.error)
  if (failed?.error) throw new Error(`Warranty records could not be loaded: ${failed.error.message}`)

  const people = new Map(staff.map((s) => [s.user_id, s.full_name || s.email || 'Team member']))
  return buildWarrantyReport({
    today,
    homes: homes.count ?? 0,
    claims: ((claims.data ?? []) as unknown as { id: string; project_id: string; title: string; category: string; location: string; status: string; reported_at: string; updated_at: string; assigned_to: string | null; projects: ProjectRef }[]).map((c) => ({
      id: c.id,
      project_id: c.project_id,
      project_name: c.projects?.name ?? 'Project',
      title: c.title,
      category: c.category,
      location: c.location,
      status: c.status,
      reported_at: c.reported_at,
      updated_at: c.updated_at,
      assignee: c.assigned_to ? (people.get(c.assigned_to) ?? null) : null,
    })),
    coverage: ((coverage.data ?? []) as unknown as { project_id: string; coverage_name: string; due_on: string; project_warranties: { projects: ProjectRef } | null }[]).map((m) => ({
      project_id: m.project_id,
      project_name: m.project_warranties?.projects?.name ?? 'Project',
      coverage_name: m.coverage_name,
      due_on: m.due_on,
    })),
    followups: ((followups.data ?? []) as unknown as { id: string; project_id: string; status: string; projects: ProjectRef; warranty_milestones: { coverage_name: string; due_on: string } | null }[]).map((f) => ({
      id: f.id,
      project_id: f.project_id,
      project_name: f.projects?.name ?? 'Project',
      coverage_name: f.warranty_milestones?.coverage_name ?? 'Anniversary',
      due_on: f.warranty_milestones?.due_on ?? today,
      status: f.status,
    })),
  })
}
