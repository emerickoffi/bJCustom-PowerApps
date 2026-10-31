import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { AlertTriangle, Lock, ListChecks as ListChecksIcon } from 'lucide-react'
import { requireStaff, canManage } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { getProfileNames, getStaffMembers } from '@/lib/queries'
import { signMediaPaths } from '@/lib/media'
import { PageHeader, DetailList } from '@/components/shared/page-header'
import { MediaGrid } from '@/components/walkthroughs/media-uploader'
import { IssueStatusBadge, PriorityBadge, ValidationBadge } from '@/components/walkthroughs/badges'
import { ApproveRepairButton, IssueNoteForm, IssueUpdateForm, MissingRepairPhotosReminder, RepairPhotoUploader, SupplementalEvidenceUploader } from '@/components/walkthroughs/issue-management'
import { IssueTimeline } from '@/components/walkthroughs/issue-timeline'
import Link from 'next/link'
import { getOrgFeatures } from '@/lib/features'
import { workStateFor, type SubmissionStatus } from '@/lib/subcontractor-work'
import { WorkStateBadge } from '@/components/subcontractor-work/work-state-badge'
import { IssueSubcontractorAssign } from '@/components/subcontractor-work/issue-subcontractor-assign'
import { IssueConversation, type ConversationMessage } from '@/components/walkthroughs/issue-conversation'
import { fullName, formatDate, formatDateTime } from '@/lib/format'
import {
  isOverdue,
  type HomeownerValidation,
  type IssueEvent,
  type IssuePriority,
  type IssueStatus,
  type MediaItem,
  type MediaKind,
} from '@/lib/walkthroughs'

export const metadata: Metadata = { title: 'Reported issue' }

function Section({
  id,
  title,
  step,
  aside,
  children,
}: {
  id: string
  title: string
  step?: number
  aside?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-5 rounded-xl border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {step !== undefined && (
            <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 font-mono text-xs font-semibold text-primary" aria-hidden="true">
              {step}
            </span>
          )}
          <h2 id={id} className="font-serif text-lg font-semibold text-foreground">
            {title}
          </h2>
        </div>
        {aside}
      </div>
      {children}
    </section>
  )
}

const Label = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{children}</h3>
)

export default async function IssuePage({ params }: { params: Promise<{ id: string; issueId: string }> }) {
  const session = await requireStaff()
  const { id, issueId } = await params
  const supabase = await createClient()

  const { data: issue } = await supabase
    .from('project_issues')
    .select('*, project:projects(id, name, project_number), walkthrough:walkthroughs(id, title)')
    .eq('id', issueId)
    .eq('project_id', id)
    .eq('organization_id', session.organizationId)
    .maybeSingle()
  if (!issue) notFound()

  const [attachmentsRes, notesRes, eventsRes, staff, reporterRes] = await Promise.all([
    supabase
      .from('issue_attachments')
      .select('id, attachment_kind, storage_path, file_name, media_kind, uploaded_by, note_id, created_at')
      .eq('issue_id', issueId)
      .order('created_at'),
    supabase
      .from('project_issue_notes')
      .select('id, body, created_by, created_at, visibility, author_kind')
      .eq('issue_id', issueId)
      .order('created_at', { ascending: false }),
    supabase
      .from('project_issue_events')
      .select('id, event_type, actor_id, from_value, to_value, details, created_at')
      .eq('issue_id', issueId)
      .order('created_at', { ascending: false }),
    getStaffMembers(session.organizationId, ['org_admin', 'project_manager', 'builder_staff']),
    supabase
      .from('clients')
      .select('first_name, last_name')
      .eq('organization_id', session.organizationId)
      .eq('portal_user_id', issue.reported_by)
      .maybeSingle(),
  ])

  const attachments = attachmentsRes.data ?? []
  const urls = await signMediaPaths(attachments.map((a) => a.storage_path))
  const toMedia = (kind: string): MediaItem[] =>
    attachments
      .filter((a) => a.attachment_kind === kind)
      .map((a) => ({ id: a.id, storage_path: a.storage_path, file_name: a.file_name, media_kind: a.media_kind as MediaKind, url: urls.get(a.storage_path) ?? null }))
  const supplemental = attachments.filter((a) => a.attachment_kind === 'supplemental')
  const allNotes = notesRes.data ?? []
  const notes = allNotes.filter((n) => n.visibility !== 'shared')
  const sharedNotes = allNotes.filter((n) => n.visibility === 'shared').reverse()
  const events = (eventsRes.data ?? []) as IssueEvent[]
  const names = await getProfileNames([
    ...notes.map((n) => n.created_by),
    ...events.map((e) => e.actor_id),
    ...supplemental.map((a) => a.uploaded_by),
    issue.builder_approved_by,
    issue.homeowner_validated_by,
    issue.reported_by,
  ])
  const staffReported = issue.reported_source === 'staff'
  const reporter = staffReported
    ? `${staff.find((s) => s.user_id === issue.reported_by)?.full_name || names.get(issue.reported_by) || 'Team member'} · Builder`
    : reporterRes.data
      ? fullName(reporterRes.data.first_name, reporterRes.data.last_name)
      : names.get(issue.reported_by) ?? 'Homeowner'
  const nameFor = (userId: string | null) => {
    if (!userId) return null
    if (userId === issue.reported_by || userId === issue.homeowner_validated_by) return reporter
    const member = staff.find((s) => s.user_id === userId)
    return member?.full_name || member?.email || names.get(userId) || 'Team member'
  }
  const conversation: ConversationMessage[] = sharedNotes.map((n) => {
    const fromBuilder = n.author_kind !== 'homeowner'
    return {
      id: n.id,
      body: n.body,
      fromBuilder,
      createdAt: n.created_at,
      author: fromBuilder
        ? `${nameFor(n.created_by)} · Builder`
        : `${n.created_by === issue.reported_by ? reporter : names.get(n.created_by) ?? 'Homeowner'} · Homeowner`,
      photos: attachments
        .filter((a) => a.note_id === n.id)
        .map((a) => ({ id: a.id, storage_path: a.storage_path, file_name: a.file_name, media_kind: a.media_kind as MediaKind, url: urls.get(a.storage_path) ?? null })),
    }
  })

  const status = issue.status as IssueStatus
  const priority = (issue.priority ?? 'normal') as IssuePriority
  const validation = issue.homeowner_validation as HomeownerValidation
  const project = issue.project as { id: string; name: string; project_number: string }
  const walkthrough = issue.walkthrough as { id: string; title: string }
  const manager = canManage(session.role)
  const closed = status === 'closed'
  const overdue = isOverdue(issue.due_date, status)
  const rejections = events.filter((e) => e.event_type === 'homeowner_rejected')

  type LatestSub = { id: string; cycle: number; status: SubmissionStatus }
  let subCompanies: { value: string; label: string }[] | null = null
  let latestSubSubmission = null as LatestSub | null
  if (manager && (await getOrgFeatures(session.organizationId)).subcontractors) {
    const [companiesRes, latestRes] = await Promise.all([
      supabase
        .from('subcontractor_companies')
        .select('id, company_name, status')
        .eq('organization_id', session.organizationId)
        .order('company_name'),
      supabase
        .from('subcontractor_work_submissions')
        .select('id, cycle, status')
        .eq('issue_id', issue.id)
        .neq('status', 'draft')
        .order('cycle', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
    if (!companiesRes.error && !latestRes.error) {
      subCompanies = (companiesRes.data ?? [])
        .filter((c) => c.status === 'active' || c.id === issue.responsible_subcontractor_company_id)
        .map((c) => ({ value: c.id as string, label: c.company_name as string }))
      latestSubSubmission = (latestRes.data as LatestSub | null) ?? null
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader icon={ListChecksIcon}
        backHref={`/projects/${project.id}/walkthroughs/${walkthrough.id}`}
        backLabel={walkthrough.title}
        eyebrow={
          <span className="flex flex-wrap items-center gap-2 normal-case tracking-normal">
            <span className="font-mono">{project.project_number}</span>
            <IssueStatusBadge status={status} />
            <PriorityBadge priority={priority} />
          </span>
        }
        title={`${issue.category} · ${issue.item_label}`}
        description={project.name}
      />

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border lg:grid-cols-4">
        {[
          { label: 'Location', value: issue.category },
          { label: 'Assigned to', value: nameFor(issue.responsible_user_id) ?? 'Unassigned' },
          {
            label: 'Due date',
            value: issue.due_date ? (
              <span className={overdue ? 'flex items-center gap-1.5 text-destructive' : undefined}>
                {overdue && <AlertTriangle className="size-4" aria-hidden="true" />}
                {formatDate(issue.due_date)}
                {overdue && <span className="sr-only">(overdue)</span>}
              </span>
            ) : (
              'Not set'
            ),
          },
          { label: 'Reported', value: formatDate(issue.reported_at) },
        ].map((item) => (
          <div key={item.label} className="flex flex-col gap-1 bg-card p-4">
            <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{item.label}</dt>
            <dd className="text-sm font-medium text-foreground">{item.value}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-8 xl:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-8">
          <Section
            id="observation-heading"
            step={1}
            title={staffReported ? 'Builder observation' : 'Homeowner observation'}
            aside={
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Lock className="size-3.5" aria-hidden="true" />
                Original wording · read-only
              </span>
            }
          >
            <DetailList
              items={[
                { label: 'Checklist item', value: issue.item_label },
                { label: 'Reported by', value: reporter },
                { label: 'Date reported', value: formatDateTime(issue.reported_at) },
              ]}
            />
            <blockquote className="whitespace-pre-line rounded-lg border-l-4 border-primary bg-primary/5 p-4 text-sm leading-relaxed text-foreground">
              {issue.homeowner_description}
            </blockquote>
            <div className="flex flex-col gap-2">
              <Label>Original photos &amp; video</Label>
              <MediaGrid evidence="original" items={toMedia('original')} emptyLabel={staffReported ? 'No files were attached during the walkthrough.' : 'The homeowner did not attach any files.'} />
            </div>
            <div className="flex flex-col gap-3 border-t pt-5">
              <div className="flex flex-col gap-1">
                <Label>Supplemental issue evidence · staff</Label>
                <p className="text-sm text-muted-foreground">
                  Extra photos of the original issue. Added alongside the homeowner&apos;s evidence, never replacing it.
                </p>
              </div>
              <MediaGrid evidence="supplemental" items={toMedia('supplemental')} emptyLabel="No supplemental photos yet." />
              {supplemental.length > 0 && (
                <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                  {supplemental.map((a) => (
                    <li key={a.id}>
                      <span className="font-medium text-foreground">{a.file_name}</span> · Added by {nameFor(a.uploaded_by) ?? 'Team member'} on{' '}
                      {formatDateTime(a.created_at)}
                    </li>
                  ))}
                </ul>
              )}
              {!closed && (
                <SupplementalEvidenceUploader issueId={issue.id} organizationId={session.organizationId} userId={session.userId} />
              )}
            </div>
          </Section>

          <Section id="corrective-heading" step={2} title="Corrective action" aside={<IssueStatusBadge status={status} />}>
            <DetailList items={[{ label: 'Assigned person', value: nameFor(issue.responsible_user_id) ?? 'Unassigned' }]} />
            <div className="flex flex-col gap-1">
              <Label>Work performed</Label>
              <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
                {issue.corrective_action || <span className="text-muted-foreground">Not documented yet.</span>}
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <Label>After photos</Label>
              {closed ? (
                <MediaGrid evidence="repair" items={toMedia('repair')} emptyLabel="No repair photos were added." />
              ) : (
                <RepairPhotoUploader issueId={issue.id} organizationId={session.organizationId} userId={session.userId} initial={toMedia('repair')} />
              )}
            </div>
            <div className="flex flex-col gap-3 border-t pt-5">
              <div className="flex flex-col gap-1">
                <Label>Repair notes · staff only</Label>
                <p className="text-sm text-muted-foreground">Never shown to the homeowner.</p>
              </div>
              {!closed && <IssueNoteForm projectId={project.id} issueId={issue.id} />}
              {notes.length > 0 ? (
                <ol className="flex flex-col divide-y rounded-lg border bg-muted/30">
                  {notes.map((note) => (
                    <li key={note.id} className="flex flex-col gap-1 p-4">
                      <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{note.body}</p>
                      <span className="text-xs text-muted-foreground">{`${nameFor(note.created_by)} · ${formatDateTime(note.created_at)}`}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                closed && <p className="text-sm text-muted-foreground">No repair notes were added.</p>
              )}
            </div>
          </Section>

          <Section id="verification-heading" step={3} title="Builder verification">
            {issue.builder_approved_at ? (
              <DetailList
                items={[
                  { label: 'Reviewer', value: nameFor(issue.builder_approved_by) ?? 'Manager' },
                  { label: 'Decision', value: 'Approved' },
                  { label: 'Date', value: formatDateTime(issue.builder_approved_at) },
                ]}
              />
            ) : status === 'resolved' ? (
              manager ? (
                <div className="flex flex-col items-start gap-3">
                  <p className="text-sm text-muted-foreground">Review the work performed and after photos, then approve to request homeowner confirmation.</p>
                  {toMedia('repair').length === 0 && <MissingRepairPhotosReminder />}
                  <ApproveRepairButton projectId={project.id} issueId={issue.id} />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Waiting for an administrator or project manager to approve the repair.</p>
              )
            ) : (
              <p className="text-sm text-muted-foreground">Set the status to Repair complete to request builder verification.</p>
            )}
          </Section>

          <Section id="validation-heading" step={4} title="Homeowner validation" aside={<ValidationBadge value={validation} />}>
            {issue.homeowner_validated_at ? (
              <DetailList
                items={[
                  { label: 'Reviewer', value: nameFor(issue.homeowner_validated_by) ?? reporter },
                  { label: 'Decision', value: validation === 'accepted' ? 'Accepted' : 'Rejected' },
                  { label: 'Date', value: formatDateTime(issue.homeowner_validated_at) },
                ]}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {issue.builder_approved_at ? 'Waiting for the homeowner to review the repair.' : 'Requested automatically after builder verification.'}
              </p>
            )}
            {issue.homeowner_validation_note && (
              <div className="flex flex-col gap-1">
                <Label>Comments</Label>
                <blockquote className="whitespace-pre-line rounded-lg bg-muted p-3 text-sm leading-relaxed text-foreground">
                  {issue.homeowner_validation_note}
                </blockquote>
              </div>
            )}
            {rejections.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {`${rejections.length} previous rejection${rejections.length === 1 ? '' : 's'} preserved in the activity history.`}
              </p>
            )}
          </Section>

          <Section
            id="conversation-heading"
            title="Conversation with homeowner"
            aside={<span className="text-xs text-muted-foreground">Visible to the homeowner</span>}
          >
            <IssueConversation messages={conversation} emptyLabel="No messages yet. Replies you send here appear in the homeowner's portal." />
            {closed ? (
              <p className="text-sm text-muted-foreground">This issue is closed, so the conversation is read-only.</p>
            ) : (
              <div className="border-t pt-5">
                <IssueNoteForm projectId={project.id} issueId={issue.id} visibility="shared" />
              </div>
            )}
          </Section>
        </div>

        <aside className="flex flex-col gap-6">
          {!closed && (
            <section aria-labelledby="manage-heading" className="flex flex-col gap-4 rounded-xl border bg-card p-5">
              <h2 id="manage-heading" className="font-serif text-lg font-semibold text-foreground">
                Manage issue
              </h2>
              <IssueUpdateForm
                projectId={project.id}
                issueId={issue.id}
                status={status}
                responsibleUserId={issue.responsible_user_id}
                correctiveAction={issue.corrective_action}
                priority={priority}
                dueDate={issue.due_date}
                staffOptions={staff.map((s) => ({ value: s.user_id, label: s.full_name || s.email || 'Team member' }))}
                canApprove={manager}
                builderApproved={!!issue.builder_approved_at}
                repairPhotoCount={toMedia('repair').length}
              />
            </section>
          )}

          {manager && subCompanies && (!closed || issue.responsible_subcontractor_company_id) && (
            <section aria-labelledby="sub-heading" className="flex flex-col gap-4 rounded-xl border bg-card p-5">
              <div className="flex flex-col gap-1">
                <h2 id="sub-heading" className="font-serif text-lg font-semibold text-foreground">
                  Responsible subcontractor
                </h2>
                <p className="text-xs text-muted-foreground">
                  The company sees this item in its portal and submits correction evidence for your verification.
                </p>
              </div>
              {closed ? (
                <p className="text-sm text-foreground">
                  {subCompanies.find((c) => c.value === issue.responsible_subcontractor_company_id)?.label ?? 'Subcontractor'}
                </p>
              ) : (
                <IssueSubcontractorAssign
                  issueId={issue.id}
                  projectId={project.id}
                  currentCompanyId={issue.responsible_subcontractor_company_id ?? null}
                  companies={subCompanies}
                />
              )}
              {latestSubSubmission && (
                <Link
                  href={`/projects/${project.id}/subcontractor-work/${latestSubSubmission.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm hover:bg-muted/50"
                >
                  <span className="font-medium text-foreground">
                    Latest submission{latestSubSubmission.cycle > 1 ? ` · Resubmission ${latestSubSubmission.cycle}` : ''}
                  </span>
                  <WorkStateBadge state={workStateFor(latestSubSubmission.status)} audience="builder" />
                </Link>
              )}
            </section>
          )}

          <section aria-labelledby="history-heading" className="flex flex-col gap-4 rounded-xl border bg-card p-5">
            <div className="flex flex-col gap-1">
              <h2 id="history-heading" className="font-serif text-lg font-semibold text-foreground">
                Activity history
              </h2>
              <p className="text-xs text-muted-foreground">Permanent record. Entries cannot be edited or removed.</p>
            </div>
            <IssueTimeline events={events} nameFor={nameFor} />
          </section>
        </aside>
      </div>
    </div>
  )
}
