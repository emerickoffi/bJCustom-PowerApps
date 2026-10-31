import { requireStaff } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { createClient } from '@/lib/supabase/server'
import {
  BUILDER_OWNED_STATUSES,
  EXPIRING_WINDOW_DAYS,
  SERVICE_RESPONSE_DAYS,
  addDaysIso,
  daysBetween,
  toCsv,
} from '@/lib/warranty-coverage'
import { CLAIM_STATUS_LABELS } from '@/components/warranty/claim-list'

type ProjectRef = { name: string; project_number: string | null } | null

export async function GET(request: Request) {
  const session = await requireStaff()
  if (!session.organizationId || !(await getOrgFeatures(session.organizationId)).warranty) {
    return new Response('Warranty is not enabled.', { status: 404 })
  }
  const report = new URL(request.url).searchParams.get('report') ?? 'open-claims'
  const supabase = await createClient()
  const { data: today } = await supabase.rpc('org_today', { p_org: session.organizationId })
  const todayIso = (today as string | null) ?? new Date().toISOString().slice(0, 10)

  let headers: string[]
  let rows: unknown[][]

  if (report === 'open-claims' || report === 'stalled-claims') {
    let q = supabase
      .from('warranty_claims')
      .select('id, title, category, location, coverage_key, status, reported_at, updated_at, assigned_to, projects(name, project_number)')
      .neq('status', 'closed')
      .order('reported_at')
      .limit(5000)
    if (report === 'stalled-claims') {
      q = q.in('status', BUILDER_OWNED_STATUSES).lt('updated_at', addDaysIso(todayIso, -SERVICE_RESPONSE_DAYS))
    }
    const { data, error } = await q
    if (error) return new Response('Could not load claims.', { status: 500 })
    const claims = (data ?? []) as unknown as {
      id: string; title: string; category: string; location: string; coverage_key: string; status: string
      reported_at: string; updated_at: string; assigned_to: string | null; projects: ProjectRef
    }[]
    const assigneeIds = [...new Set(claims.map((c) => c.assigned_to).filter(Boolean))] as string[]
    const { data: profiles } = assigneeIds.length
      ? await supabase.from('profiles').select('id, full_name, email').in('id', assigneeIds)
      : { data: [] }
    const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name || p.email || 'Team member']))
    headers = ['Project', 'Project #', 'Claim', 'Category', 'Location', 'Coverage', 'Status', 'Reported', 'Last update', 'Days since update', 'Assigned to']
    rows = claims.map((c) => [
      c.projects?.name, c.projects?.project_number, c.title, c.category, c.location, c.coverage_key,
      CLAIM_STATUS_LABELS[c.status] ?? c.status, c.reported_at.slice(0, 10), c.updated_at.slice(0, 10),
      daysBetween(c.updated_at.slice(0, 10), todayIso), c.assigned_to ? names.get(c.assigned_to) ?? '' : 'Unassigned',
    ])
  } else if (report === 'expiring') {
    const { data, error } = await supabase
      .from('warranty_milestones')
      .select('coverage_name, due_on, project_warranties!inner(stage, projects(name, project_number))')
      .is('reached_at', null)
      .gte('due_on', todayIso)
      .lte('due_on', addDaysIso(todayIso, EXPIRING_WINDOW_DAYS))
      .order('due_on')
      .limit(5000)
    if (error) return new Response('Could not load coverage.', { status: 500 })
    const ms = (data ?? []) as unknown as { coverage_name: string; due_on: string; project_warranties: { projects: ProjectRef } | null }[]
    headers = ['Project', 'Project #', 'Coverage', 'Ends', 'Days remaining']
    rows = ms.map((m) => [
      m.project_warranties?.projects?.name, m.project_warranties?.projects?.project_number, m.coverage_name, m.due_on,
      daysBetween(todayIso, m.due_on),
    ])
  } else if (report === 'homes') {
    const { data, error } = await supabase
      .from('project_warranties')
      .select('stage, start_date, projects(name, project_number), current:warranty_milestones!project_warranties_current_milestone_fk(coverage_name, due_on)')
      .neq('stage', 'archived')
      .order('start_date')
      .limit(5000)
    if (error) return new Response('Could not load warranties.', { status: 500 })
    const ws = (data ?? []) as unknown as { stage: string; start_date: string; projects: ProjectRef; current: { coverage_name: string; due_on: string } | null }[]
    headers = ['Project', 'Project #', 'Stage', 'Warranty start', 'Next milestone', 'Milestone date']
    rows = ws.map((w) => [w.projects?.name, w.projects?.project_number, w.stage, w.start_date, w.current?.coverage_name, w.current?.due_on])
  } else {
    return new Response('Unknown report.', { status: 400 })
  }

  return new Response(toCsv(headers, rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="warranty-${report}-${todayIso}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
