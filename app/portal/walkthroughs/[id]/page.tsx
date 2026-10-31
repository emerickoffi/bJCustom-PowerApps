import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CheckCircle2, ClipboardCheck, HardHat } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { getSession } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { signMediaPaths } from '@/lib/media'
import { ChecklistForm, type SavedResponse } from '@/components/walkthroughs/checklist-form'
import { MediaGrid } from '@/components/walkthroughs/media-uploader'
import { IssueStatusBadge, ValidationBadge } from '@/components/walkthroughs/badges'
import { RepairValidation } from '@/components/walkthroughs/repair-validation'
import { FocusHashTarget } from '@/components/shared/focus-hash-target'
import { HomeownerCommentForm, IssueConversation, type ConversationMessage } from '@/components/walkthroughs/issue-conversation'
import { HomeownerReportsSection } from '@/components/reports/homeowner-reports-section'
import { formatDate, formatDateTime } from '@/lib/format'
import type { HomeownerValidation, IssueStatus, MediaItem, MediaKind, ResponseValue } from '@/lib/walkthroughs'

export const metadata: Metadata = { title: 'Walkthrough checklist' }

export default async function PortalWalkthroughPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) notFound()
  const { id } = await params
  const supabase = await createClient()

  const { data: walkthrough } = await supabase
    .from('walkthroughs')
    .select('id, organization_id, title, instructions, status, scheduled_date, submitted_at, conducted_by')
    .eq('id', id)
    .maybeSingle()
  if (!walkthrough) notFound()

  const submitted = walkthrough.status === 'submitted'
  const builderLed = walkthrough.conducted_by === 'staff'

  return (
    <div className="flex flex-col gap-8">
      <FocusHashTarget />
      <PageHeader
        icon={ClipboardCheck}
        backHref="/portal"
        backLabel="Your home"
        title={walkthrough.title}
        description={
          walkthrough.scheduled_date || (walkthrough.instructions && !submitted) ? (
            <div className="flex flex-col gap-2">
              {walkthrough.scheduled_date && <p>{`Scheduled for ${formatDate(walkthrough.scheduled_date)}`}</p>}
              {walkthrough.instructions && !submitted && <p className="whitespace-pre-line">{walkthrough.instructions}</p>}
            </div>
          ) : undefined
        }
      />
      {submitted ? (
        <>
          <HomeownerReportsSection walkthroughId={walkthrough.id} userId={session.userId} />
          <SubmittedView
            walkthroughId={walkthrough.id}
            submittedAt={walkthrough.submitted_at}
            organizationId={walkthrough.organization_id}
            userId={session.userId}
            builderLed={builderLed}
          />
        </>
      ) : builderLed ? (
        <div className="flex items-start gap-3 rounded-xl border bg-muted p-5">
          <HardHat className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <p className="font-medium text-foreground">Your builder is conducting this walkthrough</p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Their findings will appear here as builder observations once they submit. You can follow and confirm each repair from this page.
            </p>
          </div>
        </div>
      ) : (
        <ChecklistEditor walkthroughId={walkthrough.id} organizationId={walkthrough.organization_id} userId={session.userId} />
      )}
    </div>
  )
}

async function ChecklistEditor({ walkthroughId, organizationId, userId }: { walkthroughId: string; organizationId: string; userId: string }) {
  const supabase = await createClient()
  const [itemsRes, responsesRes, attachmentsRes] = await Promise.all([
    supabase.from('walkthrough_items').select('id, category, label').eq('walkthrough_id', walkthroughId).order('sort_order'),
    supabase.from('walkthrough_responses').select('item_id, response, draft_description').eq('walkthrough_id', walkthroughId),
    supabase
      .from('walkthrough_attachments')
      .select('id, item_id, storage_path, file_name, media_kind')
      .eq('walkthrough_id', walkthroughId)
      .order('created_at'),
  ])

  const responses: Record<string, SavedResponse> = {}
  for (const r of responsesRes.data ?? []) {
    responses[r.item_id] = { response: r.response as ResponseValue | null, draft_description: r.draft_description }
  }
  const files = attachmentsRes.data ?? []
  const urls = await signMediaPaths(files.map((f) => f.storage_path))
  const attachments: Record<string, MediaItem[]> = {}
  for (const f of files) {
    ;(attachments[f.item_id] ??= []).push({
      id: f.id,
      storage_path: f.storage_path,
      file_name: f.file_name,
      media_kind: f.media_kind as MediaKind,
      url: urls.get(f.storage_path) ?? null,
    })
  }

  return (
    <ChecklistForm
      walkthroughId={walkthroughId}
      organizationId={organizationId}
      userId={userId}
      items={itemsRes.data ?? []}
      responses={responses}
      attachments={attachments}
    />
  )
}

async function SubmittedView({
  walkthroughId,
  submittedAt,
  organizationId,
  userId,
  builderLed,
}: {
  walkthroughId: string
  submittedAt: string | null
  organizationId: string
  userId: string
  builderLed: boolean
}) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('project_issues')
    .select('id, project_id, category, item_label, homeowner_description, reported_source, status, corrective_action, builder_approved_at, homeowner_validation, homeowner_validation_note, homeowner_validated_at')
    .eq('walkthrough_id', walkthroughId)
    .order('reported_at')
  const issues = data ?? []
  const issueIds = issues.map((i) => i.id)

  const [filesRes, notesRes, permissionRes] = issues.length
    ? await Promise.all([
        supabase
          .from('issue_attachments')
          .select('id, issue_id, note_id, attachment_kind, storage_path, file_name, media_kind')
          .in('issue_id', issueIds)
          .order('created_at'),
        supabase
          .from('project_issue_notes')
          .select('id, issue_id, body, created_by, author_kind, created_at')
          .in('issue_id', issueIds)
          .eq('visibility', 'shared')
          .order('created_at'),
        supabase.rpc('portal_contact_can', { p_project: issues[0].project_id, p_permission: 'validate_issues' }),
      ])
    : [{ data: [] }, { data: [] }, { data: false }]
  const files = filesRes.data ?? []
  const notes = notesRes.data ?? []
  const canComment = permissionRes.data === true

  const urls = await signMediaPaths(files.map((f) => f.storage_path))
  const toItem = (f: (typeof files)[number]): MediaItem => ({
    id: f.id,
    storage_path: f.storage_path,
    file_name: f.file_name,
    media_kind: f.media_kind as MediaKind,
    url: urls.get(f.storage_path) ?? null,
  })
  const mediaFor = (issueId: string, kind: string): MediaItem[] =>
    files.filter((f) => f.issue_id === issueId && f.attachment_kind === kind).map(toItem)
  const conversationFor = (issueId: string): ConversationMessage[] =>
    notes
      .filter((n) => n.issue_id === issueId)
      .map((n) => ({
        id: n.id,
        body: n.body,
        fromBuilder: n.author_kind !== 'homeowner',
        createdAt: n.created_at,
        author: n.created_by === userId ? 'You' : n.author_kind === 'homeowner' ? 'Homeowner' : 'Your builder',
        photos: files.filter((f) => f.note_id === n.id).map(toItem),
      }))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3 rounded-xl border bg-primary/5 p-5">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <p className="font-medium text-foreground">{`Submitted ${formatDateTime(submittedAt)}`}</p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {builderLed
              ? issues.length
                ? 'Your builder recorded the items below during their walkthrough. You can follow each repair and confirm it once complete.'
                : 'Your builder completed this walkthrough and found nothing that needs attention.'
              : issues.length
                ? 'Your builder has your notes. You can follow each repair below and confirm it once complete.'
                : 'Everything looked good. Thank you for completing your walkthrough.'}
          </p>
        </div>
      </div>

      {issues.length > 0 && (
        <ul className="flex flex-col gap-4">
          {issues.map((issue) => {
            const awaitingReview = issue.status === 'resolved' && issue.builder_approved_at
            const repairPhotos = mediaFor(issue.id, 'repair')
            return (
              <li
                key={issue.id}
                id={`issue-${issue.id}`}
                tabIndex={-1}
                className="flex scroll-mt-28 flex-col gap-4 rounded-xl border bg-card p-5 outline-none focus-visible:ring-2 focus-visible:ring-ring target:border-primary"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <h2 className="font-medium text-foreground">
                    <span className="text-muted-foreground">{`${issue.category} · `}</span>
                    {issue.item_label}
                  </h2>
                  <div className="flex shrink-0 gap-2">
                    <IssueStatusBadge status={issue.status as IssueStatus} />
                    {issue.homeowner_validated_at && <ValidationBadge value={issue.homeowner_validation as HomeownerValidation} />}
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {issue.reported_source === 'staff' ? 'Builder observation' : 'Your description'}
                  </h3>
                  <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{issue.homeowner_description}</p>
                  <MediaGrid evidence="original" items={mediaFor(issue.id, 'original')} emptyLabel="" />
                </div>
                {(issue.corrective_action || repairPhotos.length > 0) && (
                  <div className="flex flex-col gap-2 border-t pt-4">
                    <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Builder&apos;s repair</h3>
                    {issue.corrective_action && (
                      <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{issue.corrective_action}</p>
                    )}
                    <MediaGrid evidence="repair" items={repairPhotos} emptyLabel="" />
                  </div>
                )}
                {issue.homeowner_validation_note && (
                  <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">{`Your feedback: ${issue.homeowner_validation_note}`}</p>
                )}
                {awaitingReview && (
                  <div className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
                    <p className="text-sm font-medium text-foreground">Your builder marked this repair complete. Is it resolved?</p>
                    <RepairValidation issueId={issue.id} />
                  </div>
                )}
                <div className="flex flex-col gap-3 border-t pt-4">
                  <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Conversation with your builder</h3>
                  <IssueConversation
                    messages={conversationFor(issue.id)}
                    emptyLabel="No messages yet. Ask a question or send photos of what you are seeing."
                  />
                  {issue.status === 'closed' ? (
                    <p className="text-sm text-muted-foreground">This issue is closed. Contact your builder if something still needs attention.</p>
                  ) : canComment ? (
                    <HomeownerCommentForm issueId={issue.id} organizationId={organizationId} userId={userId} />
                  ) : (
                    <p className="text-sm text-muted-foreground">Your builder has not given you permission to comment on repairs.</p>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
