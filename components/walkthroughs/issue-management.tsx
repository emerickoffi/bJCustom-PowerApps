'use client'

import { useActionState, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { addIssueNoteAction, approveRepairAction, updateIssueAction } from '@/app/actions/walkthroughs'
import { Camera } from 'lucide-react'
import { initialActionState, type ActionState } from '@/lib/action-state'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'
import { SelectField, TextAreaField, TextField } from '@/components/shared/form-field'
import { ActionButton, InlineActionForm } from '@/components/shared/inline-action'
import { MediaUploader } from '@/components/walkthroughs/media-uploader'
import {
  ISSUE_PRIORITIES,
  ISSUE_STATUS_LABELS,
  PRIORITY_LABELS,
  STAFF_SETTABLE_ISSUE_STATUSES,
  type IssuePriority,
  type IssueStatus,
  type MediaItem,
} from '@/lib/walkthroughs'

export function IssueUpdateForm({
  projectId,
  issueId,
  status,
  responsibleUserId,
  correctiveAction,
  priority,
  dueDate,
  staffOptions,
  canApprove = false,
  builderApproved = false,
  repairPhotoCount = 0,
}: {
  projectId: string
  issueId: string
  status: IssueStatus
  responsibleUserId: string | null
  correctiveAction: string | null
  priority: IssuePriority
  dueDate: string | null
  staffOptions: { value: string; label: string }[]
  canApprove?: boolean
  builderApproved?: boolean
  repairPhotoCount?: number
}) {
  const [savedStatus, setSavedStatus] = useState<string | null>(null)
  const [state, formAction] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await updateIssueAction(projectId, issueId, prev, formData)
    setSavedStatus(result.success ? String(formData.get('status') ?? '') : null)
    return result
  }, initialActionState)
  const showApprovalPrompt = savedStatus === 'resolved' && status === 'resolved' && canApprove && !builderApproved
  return (
    <>
    {showApprovalPrompt && (
      <RepairApprovalPrompt projectId={projectId} issueId={issueId} repairPhotoCount={repairPhotoCount} />
    )}
    <form action={formAction} className="flex flex-col gap-4">
      <SelectField
        name="status"
        label="Issue status"
        required
        defaultValue={status === 'closed' ? 'resolved' : status}
        options={STAFF_SETTABLE_ISSUE_STATUSES.map((s) => ({ value: s, label: ISSUE_STATUS_LABELS[s] }))}
        hint="Issues close automatically once the homeowner confirms the repair."
      />
      <SelectField
        name="responsible_user_id"
        label="Responsible person"
        defaultValue={responsibleUserId ?? ''}
        placeholder="Unassigned"
        options={staffOptions}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        <SelectField
          name="priority"
          label="Priority"
          required
          defaultValue={priority}
          options={ISSUE_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }))}
        />
        <TextField name="due_date" label="Due date" type="date" defaultValue={dueDate ?? ''} />
      </div>
      <TextAreaField
        name="corrective_action"
        label="Corrective action"
        defaultValue={correctiveAction ?? ''}
        maxLength={5000}
        rows={4}
        hint="Visible to the homeowner. Describe the planned or completed repair."
      />
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Saving..." className="w-full">
        Save changes
      </SubmitButton>
    </form>
    </>
  )
}

export function MissingRepairPhotosReminder() {
  return (
    <p className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <Camera className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      No after-repair photos yet. Adding them helps the homeowner confirm the work.
    </p>
  )
}

function RepairApprovalPrompt({ projectId, issueId, repairPhotoCount }: { projectId: string; issueId: string; repairPhotoCount: number }) {
  return (
    <div role="region" aria-label="Builder approval" className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">Next step: builder approval</p>
        <p className="text-sm text-muted-foreground">
          Review the work, then approve it to ask the homeowner to confirm the repair. Nothing is approved until you do.
        </p>
      </div>
      {repairPhotoCount === 0 && <MissingRepairPhotosReminder />}
      <ApproveRepairButton projectId={projectId} issueId={issueId} />
    </div>
  )
}

export function ApproveRepairButton({ projectId, issueId }: { projectId: string; issueId: string }) {
  return (
    <ActionButton
      action={approveRepairAction.bind(null, projectId, issueId)}
      label="Approve repair"
      pendingLabel="Approving..."
      variant="default"
      size="lg"
      confirmMessage="Approve this repair and ask the homeowner to confirm it?"
    />
  )
}

export function IssueNoteForm({
  projectId,
  issueId,
  visibility = 'internal',
}: {
  projectId: string
  issueId: string
  visibility?: 'internal' | 'shared'
}) {
  const shared = visibility === 'shared'
  return (
    <InlineActionForm action={addIssueNoteAction.bind(null, projectId, issueId)} className="flex flex-col gap-3">
      <input type="hidden" name="visibility" value={visibility} />
      <TextAreaField
        name="body"
        label={shared ? 'Reply to the homeowner' : 'Add internal note'}
        required
        maxLength={5000}
        rows={3}
        hint={shared ? 'The homeowner sees this reply and gets a notification.' : 'Staff only. Never shown to the homeowner.'}
      />
      <SubmitButton size="default" pendingLabel={shared ? 'Sending...' : 'Adding...'} className="self-end">
        {shared ? 'Send reply' : 'Add note'}
      </SubmitButton>
    </InlineActionForm>
  )
}

export function SupplementalEvidenceUploader({
  issueId,
  organizationId,
  userId,
}: {
  issueId: string
  organizationId: string
  userId: string
}) {
  const router = useRouter()
  const [items, setItems] = useState<MediaItem[]>([])
  return (
    <MediaUploader
      label="Add issue photos"
      evidence="supplemental"
      items={items}
      onItemsChange={(next) => {
        setItems(next)
        router.refresh()
      }}
      pathFor={(name) => `issues/${issueId}/supplemental/${name}`}
      register={async (meta) => {
        const { data, error } = await createClient()
          .from('issue_attachments')
          .insert({ ...meta, organization_id: organizationId, issue_id: issueId, attachment_kind: 'supplemental', uploaded_by: userId })
          .select('id')
          .single()
        return error ? { error: 'The photo uploaded but could not be linked to the issue.' } : { id: data.id }
      }}
    />
  )
}

export function RepairPhotoUploader({
  issueId,
  organizationId,
  userId,
  initial,
}: {
  issueId: string
  organizationId: string
  userId: string
  initial: MediaItem[]
}) {
  const router = useRouter()
  const [items, setItems] = useState(initial)
  return (
    <MediaUploader
      label="Add repair photos"
      evidence="repair"
      items={items}
      onItemsChange={(next) => {
        setItems(next)
        router.refresh()
      }}
      pathFor={(name) => `issues/${issueId}/${name}`}
      register={async (meta) => {
        const { data, error } = await createClient()
          .from('issue_attachments')
          .insert({ ...meta, organization_id: organizationId, issue_id: issueId, attachment_kind: 'repair', uploaded_by: userId })
          .select('id')
          .single()
        return error ? { error: 'The photo uploaded but could not be linked to the issue.' } : { id: data.id }
      }}
    />
  )
}
