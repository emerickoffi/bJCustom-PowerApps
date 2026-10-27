'use client'

import { changeProjectStatusAction } from '@/app/actions/projects'
import { allowedNextStatuses, PROJECT_STATUS_LABELS, type ProjectStatus } from '@/lib/domain'
import { InlineActionForm } from '@/components/shared/inline-action'
import { SelectField, TextField } from '@/components/shared/form-field'
import { SubmitButton } from '@/components/shared/form-message'

export function StatusChanger({ projectId, status }: { projectId: string; status: ProjectStatus }) {
  const options = allowedNextStatuses(status)
  if (options.length === 0) {
    return <p className="text-sm text-muted-foreground">This project is completed. Its status is locked.</p>
  }

  return (
    <InlineActionForm action={changeProjectStatusAction} className="flex flex-col gap-4">
      <input type="hidden" name="project_id" value={projectId} />
      <SelectField
        name="status"
        label="Move to"
        required
        placeholder="Select a status"
        options={options.map((s) => ({ value: s, label: PROJECT_STATUS_LABELS[s] }))}
      />
      <TextField name="note" label="Note" placeholder="Optional reason or context" maxLength={500} />
      <SubmitButton pendingLabel="Updating..." className="w-full">
        Update status
      </SubmitButton>
    </InlineActionForm>
  )
}
