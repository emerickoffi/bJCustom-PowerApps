'use server'

import { requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { getProfileNames, getStaffMembers } from '@/lib/queries'
import { signMediaPaths } from '@/lib/media'
import { isUuid } from '@/lib/subcontractor-projects'
import type { IssueEvent, IssuePriority, IssueStatus, MediaItem, MediaKind } from '@/lib/walkthroughs'

export type IssuePanelNote = { id: string; body: string; author: string; createdAt: string; shared: boolean; fromHomeowner: boolean }

export type IssuePanelData = {
  id: string
  category: string
  itemLabel: string
  description: string | null
  status: IssueStatus
  priority: IssuePriority
  dueDate: string | null
  reportedAt: string
  reporter: string
  assignee: string | null
  correctiveAction: string | null
  original: MediaItem[]
  supplemental: MediaItem[]
  repair: MediaItem[]
  notes: IssuePanelNote[]
  events: IssueEvent[]
  names: Record<string, string>
}

export type IssuePanelResult = { ok: true; data: IssuePanelData } | { ok: false; error: string }

/** Read-only issue summary for the punch-list panel. Same org and project scoping as the full issue page. */
export async function getIssuePanel(projectId: string, issueId: string): Promise<IssuePanelResult> {
  const session = await requireStaff()
  if (!isUuid(projectId) || !isUuid(issueId)) return { ok: false, error: 'Issue not found.' }
  const supabase = await createClient()

  const { data: issue, error } = await supabase
    .from('project_issues')
    .select('*')
    .eq('id', issueId)
    .eq('project_id', projectId)
    .eq('organization_id', session.organizationId)
    .maybeSingle()
  if (error) return { ok: false, error: 'This issue could not be loaded. Try again.' }
  if (!issue) return { ok: false, error: 'Issue not found. It may have been removed.' }

  const [attachmentsRes, notesRes, eventsRes, staff, reporterRes] = await Promise.all([
    supabase
      .from('issue_attachments')
      .select('id, attachment_kind, storage_path, file_name, media_kind, note_id')
      .eq('issue_id', issueId)
      .order('created_at'),
    supabase
      .from('project_issue_notes')
      .select('id, body, created_by, created_at, visibility, author_kind')
      .eq('issue_id', issueId)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('project_issue_events')
      .select('id, event_type, actor_id, from_value, to_value, details, created_at')
      .eq('issue_id', issueId)
      .order('created_at', { ascending: false })
      .limit(15),
    getStaffMembers(session.organizationId, ['org_admin', 'project_manager', 'builder_staff']),
    supabase
      .from('clients')
      .select('first_name, last_name')
      .eq('organization_id', session.organizationId)
      .eq('portal_user_id', issue.reported_by)
      .maybeSingle(),
  ])
  if (attachmentsRes.error || notesRes.error || eventsRes.error) return { ok: false, error: 'This issue could not be loaded. Try again.' }

  const attachments = (attachmentsRes.data ?? []).filter((a) => !a.note_id)
  const urls = await signMediaPaths(attachments.map((a) => a.storage_path))
  const media = (kind: string): MediaItem[] =>
    attachments
      .filter((a) => a.attachment_kind === kind)
      .map((a) => ({ id: a.id, storage_path: a.storage_path, file_name: a.file_name, media_kind: a.media_kind as MediaKind, url: urls.get(a.storage_path) ?? null }))

  const notes = notesRes.data ?? []
  const events = (eventsRes.data ?? []) as IssueEvent[]
  const profileNames = await getProfileNames([...notes.map((n) => n.created_by), ...events.map((e) => e.actor_id), issue.reported_by])

  const staffReported = issue.reported_source === 'staff'
  const homeownerName = reporterRes.data
    ? [reporterRes.data.first_name, reporterRes.data.last_name].filter(Boolean).join(' ')
    : profileNames.get(issue.reported_by) ?? 'Homeowner'
  const staffName = (userId: string | null) => {
    if (!userId) return null
    const member = staff.find((s) => s.user_id === userId)
    return member?.full_name || member?.email || profileNames.get(userId) || 'Team member'
  }
  const reporter = staffReported ? `${staffName(issue.reported_by)} · Builder` : homeownerName

  const names: Record<string, string> = {}
  for (const e of events) if (e.actor_id) names[e.actor_id] = e.actor_id === issue.reported_by ? reporter : staffName(e.actor_id) ?? 'Team member'

  return {
    ok: true,
    data: {
      id: issue.id,
      category: issue.category,
      itemLabel: issue.item_label,
      description: issue.homeowner_description ?? null,
      status: issue.status as IssueStatus,
      priority: (issue.priority ?? 'normal') as IssuePriority,
      dueDate: issue.due_date ?? null,
      reportedAt: issue.reported_at,
      reporter,
      assignee: staffName(issue.responsible_user_id),
      correctiveAction: issue.corrective_action ?? null,
      original: media('original'),
      supplemental: media('supplemental'),
      repair: media('repair'),
      notes: notes.map((n) => {
        const fromHomeowner = n.author_kind === 'homeowner'
        return {
          id: n.id,
          body: n.body,
          createdAt: n.created_at,
          shared: n.visibility === 'shared',
          fromHomeowner,
          author: fromHomeowner ? `${n.created_by === issue.reported_by ? homeownerName : profileNames.get(n.created_by) ?? 'Homeowner'} · Homeowner` : staffName(n.created_by) ?? 'Team member',
        }
      }),
      events,
      names,
    },
  }
}
