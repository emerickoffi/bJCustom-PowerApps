'use client'

import { useActionState, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { addIssueNoteAction, approveRepairAction, updateIssueAction } from '@/app/actions/walkthroughs'
import { initialActionState } from '@/lib/action-state'
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
}: {
  projectId: string
  issueId: string
  status: IssueStatus
  responsibleUserId: string | null
  correctiveAction: string | null
  priority: IssuePriority
  dueDate: string | null
  staffOptions: { value: string; label: string }[]
}) {
  const [state, formAction] = useActionState(updateIssueAction.bind(null, projectId, issueId), initialActionState)
  return (
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
