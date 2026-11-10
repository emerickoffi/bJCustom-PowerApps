import 'server-only'
import type { createClient } from '@/lib/supabase/server'
import { todayIso } from '@/lib/schedule'
import {
  RFI_COLUMNS,
  isRfiStatus,
  type RfiAttachment,
  type RfiComment,
  type RfiDetail,
  type RfiEvent,
  type RfiRecord,
  type RfiResponse,
} from '@/lib/rfis'

type Supabase = Awaited<ReturnType<typeof createClient>>

export type RfiDetailResult = { state: 'ready'; detail: RfiDetail } | { state: 'not_found' } | { state: 'error' }

/**
 * One question with its answers, files, comments and history, read as the signed-in user. Row-level security
 * decides every part: a homeowner gets a shared question without comments or history, a reassigned responder
 * gets nothing at all.
 */
export async function loadRfiDetail(supabase: Supabase, rfiId: string, viewerId: string): Promise<RfiDetailResult> {
  const { data: row, error } = await supabase.from('project_rfis').select(RFI_COLUMNS).eq('id', rfiId).maybeSingle()
  if (error) return { state: 'error' }
  const rfi = row as unknown as RfiRecord | null
  if (!rfi || !isRfiStatus(rfi.status)) return { state: 'not_found' }

  const [responses, comments, events, attachments, participant, canEdit, canManage, project] = await Promise.all([
    supabase
      .from('project_rfi_responses')
      .select('id, cycle, body, responded_by, responded_by_name, responded_by_company, created_at')
      .eq('rfi_id', rfiId)
      .order('created_at', { ascending: true }),
    supabase
      .from('project_rfi_comments')
      .select('id, body, author_id, author_name, created_at')
      .eq('rfi_id', rfiId)
      .order('created_at', { ascending: true })
      .limit(500),
    supabase
      .from('project_rfi_events')
      .select('id, event_type, internal, actor_name, from_status, to_status, note, details, created_at')
      .eq('rfi_id', rfiId)
      .order('created_at', { ascending: true })
      .limit(500),
    supabase
      .from('project_rfi_attachments')
      .select('id, kind, response_id, storage_path, file_name, content_type, size_bytes, created_at')
      .eq('rfi_id', rfiId)
      .order('created_at', { ascending: true }),
    supabase.rpc('rfi_can_participate', { p_rfi: rfiId }),
    supabase.rpc('rfi_can_edit', { p_rfi: rfiId }),
    supabase.rpc('rfi_can_manage', { p_org: rfi.organization_id, p_project: rfi.project_id }),
    // External responders and homeowners cannot read the projects table; their pages supply the name another way.
    supabase.from('projects').select('name').eq('id', rfi.project_id).maybeSingle(),
  ])
  if (responses.error || comments.error || events.error || attachments.error) return { state: 'error' }

  return {
    state: 'ready',
    detail: {
      rfi,
      responses: (responses.data ?? []) as RfiResponse[],
      comments: (comments.data ?? []) as RfiComment[],
      events: (events.data ?? []) as RfiEvent[],
      attachments: ((attachments.data ?? []) as RfiAttachment[]).map((a) => ({ ...a, size_bytes: Number(a.size_bytes) })),
      permissions: {
        participant: participant.data === true,
        canEdit: canEdit.data === true,
        canManage: canManage.data === true,
        isResponder: rfi.responder_user_id === viewerId,
      },
      viewerId,
      projectName: (project.data as { name: string } | null)?.name ?? null,
      today: todayIso(),
    },
  }
}
