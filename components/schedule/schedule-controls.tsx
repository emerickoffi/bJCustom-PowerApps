'use client'

import { captureBaselineAction, initializeScheduleAction } from '@/app/actions/schedule'
import { ActionButton, InlineActionForm } from '@/components/shared/inline-action'
import { SubmitButton } from '@/components/shared/form-message'
import { TextAreaField, TextField } from '@/components/shared/form-field'

export function InitializeScheduleButton({ projectId, label = 'Apply standard template' }: { projectId: string; label?: string }) {
  return (
    <ActionButton
      action={initializeScheduleAction.bind(null, projectId)}
      label={label}
      pendingLabel="Building schedule..."
      variant="default"
      size="lg"
    />
  )
}

export function BaselineForm({ projectId, nextVersion }: { projectId: string; nextVersion: number }) {
  return (
    <InlineActionForm action={captureBaselineAction.bind(null, projectId)} className="flex flex-col gap-3">
      <TextField name="name" label="Baseline name" required maxLength={120} defaultValue={`Baseline v${nextVersion}`} />
      <TextAreaField name="notes" label="Notes" rows={2} maxLength={2000} hint="Why this plan is being approved or revised." />
      <SubmitButton size="default" variant="outline" pendingLabel="Approving...">
        Approve baseline
      </SubmitButton>
    </InlineActionForm>
  )
}
