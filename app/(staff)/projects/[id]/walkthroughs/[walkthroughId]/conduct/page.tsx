import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { ClipboardCheck } from 'lucide-react'
import { requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { signMediaPaths } from '@/lib/media'
import { PageHeader } from '@/components/shared/page-header'
import { ChecklistForm, type SavedResponse } from '@/components/walkthroughs/checklist-form'
import type { MediaItem, MediaKind, ResponseValue } from '@/lib/walkthroughs'

export const metadata: Metadata = { title: 'Conduct walkthrough' }

export default async function ConductWalkthroughPage({ params }: { params: Promise<{ id: string; walkthroughId: string }> }) {
  const session = await requireStaff()
  const { id, walkthroughId } = await params
  const supabase = await createClient()
  const detailHref = `/projects/${id}/walkthroughs/${walkthroughId}`

  const { data: walkthrough } = await supabase
    .from('walkthroughs')
    .select('id, organization_id, title, instructions, status, conducted_by, conducted_by_user, project:projects(name, project_number)')
    .eq('id', walkthroughId)
    .eq('project_id', id)
    .eq('organization_id', session.organizationId)
    .maybeSingle()
  if (!walkthrough) notFound()
  if (walkthrough.status === 'submitted' || walkthrough.conducted_by !== 'staff' || walkthrough.conducted_by_user !== session.userId) {
    redirect(detailHref)
  }

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
  const project = walkthrough.project as unknown as { name: string; project_number: string }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        icon={ClipboardCheck}
        backHref={detailHref}
        backLabel="Walkthrough details"
        eyebrow={<span className="font-mono normal-case tracking-normal">{project.project_number}</span>}
        title={walkthrough.title}
        description={
          <span className="flex flex-col gap-1">
            <span>{`Builder-led inspection · ${project.name}`}</span>
            <span>Findings stay a draft until you submit. Submitting creates punch list items, labelled as builder observations.</span>
          </span>
        }
      />
      <ChecklistForm
        mode="staff"
        doneHref={detailHref}
        walkthroughId={walkthrough.id}
        organizationId={walkthrough.organization_id}
        userId={session.userId}
        items={itemsRes.data ?? []}
        responses={responses}
        attachments={attachments}
      />
    </div>
  )
}
