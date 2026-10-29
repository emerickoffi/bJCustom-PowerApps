import 'server-only'
import { cache } from 'react'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canManage, requireStaff, type StaffSession } from '@/lib/session'
import { requireFeature, getOrgFeatures } from '@/lib/features'
import { signMediaPaths } from '@/lib/media'
import type { ClientUpdatePhotoSource, ClientUpdateRow, ClientUpdateSourceType } from '@/lib/client-updates'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type ClientUpdateProject = { id: string; name: string; project_number: string | null; archived_at: string | null }

const UPDATE_COLUMNS =
  'id, project_id, title, period_start, period_end, overview, completed_work, in_progress_work, upcoming_work, homeowner_message, ai_assisted, status, version, revision, published_version, first_published_at, last_published_at, updated_at'

export const requireClientUpdateProject = cache(
  async (projectId: string): Promise<{ session: StaffSession; project: ClientUpdateProject; canEdit: boolean; aiAvailable: boolean }> => {
    const session = await requireStaff()
    await requireFeature(session.organizationId, 'client_updates')
    if (!UUID.test(projectId)) notFound()
    const supabase = await createClient()
    const [{ data: project }, { data: canView }, features] = await Promise.all([
      supabase.from('projects').select('id, name, project_number, archived_at').eq('id', projectId).eq('organization_id', session.organizationId).maybeSingle(),
      supabase.rpc('can_view_project_internal', { p_project: projectId }),
      getOrgFeatures(session.organizationId),
    ])
    if (!project || !canView) notFound()
    return {
      session,
      project: project as ClientUpdateProject,
      canEdit: canManage(session.role) && !project.archived_at,
      aiAvailable: Boolean(features.ai_assistant),
    }
  },
)

export async function listClientUpdates(projectId: string) {
  const supabase = await createClient()
  const { data } = await supabase.from('client_updates').select(UPDATE_COLUMNS).eq('project_id', projectId).order('period_end', { ascending: false }).limit(100)
  return (data ?? []) as ClientUpdateRow[]
}

export type DraftPhoto = { source_type: ClientUpdatePhotoSource; source_id: string; caption: string | null; is_cover: boolean; url: string | null }
export type DraftSource = { source_type: ClientUpdateSourceType; source_id: string }

export async function getClientUpdate(projectId: string, updateId: string) {
  if (!UUID.test(updateId)) notFound()
  const supabase = await createClient()
  const [{ data: update }, { data: sources }, { data: photos }] = await Promise.all([
    supabase.from('client_updates').select(UPDATE_COLUMNS).eq('id', updateId).eq('project_id', projectId).maybeSingle(),
    supabase.from('client_update_sources').select('source_type, source_id').eq('client_update_id', updateId),
    supabase.from('client_update_photos').select('source_type, source_id, storage_path, caption, is_cover, sort_order').eq('client_update_id', updateId).order('sort_order'),
  ])
  if (!update) notFound()
  const signed = await signMediaPaths((photos ?? []).map((p) => p.storage_path))
  return {
    update: update as ClientUpdateRow,
    sources: (sources ?? []) as DraftSource[],
    photos: (photos ?? []).map((p) => ({
      source_type: p.source_type,
      source_id: p.source_id,
      caption: p.caption,
      is_cover: p.is_cover,
      url: signed.get(p.storage_path) ?? null,
    })) as DraftPhoto[],
  }
}

export type CandidateLog = { id: string; log_date: string; work_performed: string | null; progress_notes: string | null; work_planned_next: string | null }
export type CandidateActivity = { id: string; name: string; phase: string | null; status: string; percent_complete: number | null; planned_start: string | null; planned_end: string | null; actual_end: string | null; public_note: string | null }
export type CandidatePhoto = { source_type: ClientUpdatePhotoSource; source_id: string; label: string; caption: string | null; date: string; url: string | null }

/** Only finalized daily logs, published schedule activities, and image issue attachments are offered as sources. */
export async function getClientUpdateCandidates(projectId: string, start: string, end: string) {
  const supabase = await createClient()
  const [{ data: logs }, { data: activities }, { data: logPhotos }, { data: issuePhotos }] = await Promise.all([
    supabase
      .from('daily_logs')
      .select('id, log_date, work_performed, progress_notes, work_planned_next')
      .eq('project_id', projectId)
      .eq('status', 'finalized')
      .gte('log_date', start)
      .lte('log_date', end)
      .order('log_date')
      .limit(62),
    supabase
      .from('schedule_activities')
      .select('id, name, phase, status, percent_complete, planned_start, planned_end, actual_end, public_note')
      .eq('project_id', projectId)
      .eq('is_published', true)
      .order('sort_order')
      .limit(200),
    supabase
      .from('daily_log_photos')
      .select('id, storage_path, caption, file_name, created_at, daily_logs!inner(project_id, status, log_date)')
      .eq('daily_logs.project_id', projectId)
      .eq('daily_logs.status', 'finalized')
      .gte('daily_logs.log_date', start)
      .lte('daily_logs.log_date', end)
      .order('created_at', { ascending: false })
      .limit(80),
    supabase
      .from('issue_attachments')
      .select('id, storage_path, file_name, created_at, mime_type, project_issues!inner(project_id, item_label)')
      .eq('project_issues.project_id', projectId)
      .like('mime_type', 'image/%')
      .gte('created_at', `${start}T00:00:00Z`)
      .lte('created_at', `${end}T23:59:59Z`)
      .order('created_at', { ascending: false })
      .limit(40),
  ])

  type LogPhotoRow = { id: string; storage_path: string; caption: string | null; file_name: string | null; created_at: string; daily_logs: { log_date: string } | { log_date: string }[] }
  type IssuePhotoRow = { id: string; storage_path: string; file_name: string | null; created_at: string; project_issues: { item_label: string | null } | { item_label: string | null }[] }
  const one = <T,>(v: T | T[]) => (Array.isArray(v) ? v[0] : v)

  const lp = (logPhotos ?? []) as LogPhotoRow[]
  const ip = (issuePhotos ?? []) as IssuePhotoRow[]
  const signed = await signMediaPaths([...lp.map((p) => p.storage_path), ...ip.map((p) => p.storage_path)])
  const photos: CandidatePhoto[] = [
    ...lp.map((p) => ({
      source_type: 'daily_log_photo' as const,
      source_id: p.id,
      label: 'Daily log',
      caption: p.caption,
      date: one(p.daily_logs)?.log_date ?? p.created_at.slice(0, 10),
      url: signed.get(p.storage_path) ?? null,
    })),
    ...ip.map((p) => ({
      source_type: 'issue_attachment' as const,
      source_id: p.id,
      label: one(p.project_issues)?.item_label || 'Issue photo',
      caption: null,
      date: p.created_at.slice(0, 10),
      url: signed.get(p.storage_path) ?? null,
    })),
  ]

  return { logs: (logs ?? []) as CandidateLog[], activities: (activities ?? []) as CandidateActivity[], photos }
}
