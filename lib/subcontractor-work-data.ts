import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { signMediaPaths } from '@/lib/media'
import { SUB_WORK_BUCKET, isSubWorkSetupError, type SubmissionKind, type SubmissionStatus } from '@/lib/subcontractor-work'
import type { MediaItem, MediaKind } from '@/lib/walkthroughs'

export type EvidenceItem = MediaItem & { uploadedBy: string; createdAt: string }

export type SubmissionCycle = {
  id: string
  organizationId: string
  projectId: string
  companyId: string
  kind: SubmissionKind
  assignmentId: string | null
  issueId: string | null
  cycle: number
  status: SubmissionStatus
  completionNotes: string | null
  completedOn: string | null
  createdAt: string
  submittedBy: string | null
  submittedAt: string | null
  reviewedBy: string | null
  reviewedAt: string | null
  reviewNotes: string | null
  completion: EvidenceItem[]
  inspection: EvidenceItem[]
  linkedIssueIds: string[]
}

type SubmissionRow = {
  id: string
  organization_id: string
  project_id: string
  subcontractor_company_id: string
  submission_kind: SubmissionKind
  assignment_id: string | null
  issue_id: string | null
  cycle: number
  status: SubmissionStatus
  completion_notes: string | null
  completed_on: string | null
  created_at: string
  submitted_by: string | null
  submitted_at: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  review_notes: string | null
}

type AttachmentRow = {
  id: string
  submission_id: string
  evidence_role: 'completion' | 'inspection'
  storage_path: string
  file_name: string
  media_kind: MediaKind
  uploaded_by: string
  created_at: string
}

const SUBMISSION_COLUMNS =
  'id, organization_id, project_id, subcontractor_company_id, submission_kind, assignment_id, issue_id, cycle, status, completion_notes, completed_on, created_at, submitted_by, submitted_at, reviewed_by, reviewed_at, review_notes'

/** Every submission cycle for one target, newest first. RLS limits rows to the caller's company or reviewers. */
export async function loadSubmissionCycles(
  filter: { column: 'assignment_id' | 'issue_id' | 'id' | 'project_id'; value: string },
): Promise<{ cycles: SubmissionCycle[]; setupRequired: boolean }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('subcontractor_work_submissions')
    .select(SUBMISSION_COLUMNS)
    .eq(filter.column, filter.value)
    .order('cycle', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) return { cycles: [], setupRequired: isSubWorkSetupError(error) }
  const rows = (data ?? []) as SubmissionRow[]
  if (!rows.length) return { cycles: [], setupRequired: false }
  const ids = rows.map((r) => r.id)
  const [{ data: attachments }, { data: links }] = await Promise.all([
    supabase
      .from('subcontractor_submission_attachments')
      .select('id, submission_id, evidence_role, storage_path, file_name, media_kind, uploaded_by, created_at')
      .in('submission_id', ids)
      .order('created_at'),
    supabase.from('subcontractor_submission_issue_links').select('submission_id, issue_id').in('submission_id', ids),
  ])
  const attachmentRows = (attachments ?? []) as AttachmentRow[]
  const urls = await signMediaPaths(attachmentRows.map((a) => a.storage_path), SUB_WORK_BUCKET)
  const cycles = rows.map((r) => {
    const own = attachmentRows
      .filter((a) => a.submission_id === r.id)
      .map((a) => ({
        role: a.evidence_role,
        item: {
          id: a.id,
          storage_path: a.storage_path,
          file_name: a.file_name,
          media_kind: a.media_kind,
          url: urls.get(a.storage_path) ?? null,
          uploadedBy: a.uploaded_by,
          createdAt: a.created_at,
        },
      }))
    return {
      id: r.id,
      organizationId: r.organization_id,
      projectId: r.project_id,
      companyId: r.subcontractor_company_id,
      kind: r.submission_kind,
      assignmentId: r.assignment_id,
      issueId: r.issue_id,
      cycle: r.cycle,
      status: r.status,
      completionNotes: r.completion_notes,
      completedOn: r.completed_on,
      createdAt: r.created_at,
      submittedBy: r.submitted_by,
      submittedAt: r.submitted_at,
      reviewedBy: r.reviewed_by,
      reviewedAt: r.reviewed_at,
      reviewNotes: r.review_notes,
      completion: own.filter((o) => o.role === 'completion').map((o) => o.item),
      inspection: own.filter((o) => o.role === 'inspection').map((o) => o.item),
      linkedIssueIds: (links ?? []).filter((l) => l.submission_id === r.id).map((l) => l.issue_id as string),
    }
  })
  return { cycles, setupRequired: false }
}

/** Display names for audit lines; RLS may hide some profiles, so callers fall back to a role label. */
export async function loadProfileNames(ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))]
  if (!unique.length) return new Map()
  const supabase = await createClient()
  const { data } = await supabase.from('profiles').select('id, full_name, email').in('id', unique)
  return new Map((data ?? []).map((p) => [p.id as string, (p.full_name as string) || (p.email as string) || 'Team member']))
}
