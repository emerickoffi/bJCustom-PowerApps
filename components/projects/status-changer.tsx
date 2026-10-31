'use client'

import Link from 'next/link'
import { ClipboardCheck } from 'lucide-react'
import { changeProjectStatusAction } from '@/app/actions/projects'
import { allowedNextStatuses, PROJECT_STATUS_LABELS, type ProjectStatus } from '@/lib/domain'
import { InlineActionForm } from '@/components/shared/inline-action'
import { SelectField, TextField } from '@/components/shared/form-field'
import { SubmitButton } from '@/components/shared/form-message'
import { Button } from '@/components/ui/button'

export function StatusChanger({ projectId, status }: { projectId: string; status: ProjectStatus }) {
  const next = allowedNextStatuses(status)
  if (next.length === 0) {
    return <p className="text-sm text-muted-foreground">This project is completed. Its status is locked.</p>
  }
  const canComplete = next.includes('completed')
  const options = next.filter((s) => s !== 'completed')

  return (
    <div className="flex flex-col gap-4">
      {canComplete && (
        <Button variant="outline" className="w-full" render={<Link href={`/projects/${projectId}/complete`} />} nativeButton={false}>
          <ClipboardCheck data-icon="inline-start" />
          Review completion
        </Button>
      )}
      {options.length > 0 && (
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
      )}
      {canComplete && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Completion runs a readiness review of schedule, punch list, walkthrough and handover records.
        </p>
      )}
    </div>
  )
}
