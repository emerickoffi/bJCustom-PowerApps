'use client'

import { useActionState } from 'react'
import { SelectField } from '@/components/shared/form-field'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'
import { initialActionState } from '@/lib/action-state'
import { assignIssueSubcontractorAction } from '@/app/actions/subcontractor-work'

export function IssueSubcontractorAssign({
  issueId,
  projectId,
  currentCompanyId,
  companies,
}: {
  issueId: string
  projectId: string
  currentCompanyId: string | null
  companies: { value: string; label: string }[]
}) {
  const [state, formAction] = useActionState(assignIssueSubcontractorAction, initialActionState)
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="issue_id" value={issueId} />
      <input type="hidden" name="project_id" value={projectId} />
      <SelectField
        name="company_id"
        label="Corrective work by"
        defaultValue={currentCompanyId ?? 'none'}
        options={[{ value: 'none', label: 'Not assigned to a subcontractor' }, ...companies]}
        hint="Subcontractor portal users at this company can submit after-repair photos for verification."
      />
      <FormMessage state={state} />
      <SubmitButton size="default" variant="outline" pendingLabel="Saving...">
        Save assignment
      </SubmitButton>
    </form>
  )
}
