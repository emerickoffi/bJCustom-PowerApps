'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { FolderKanban as FolderKanbanIcon, HardHat as HardHatIcon, Phone as PhoneIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { initialActionState, type ActionState } from '@/lib/action-state'
import { SUBCONTRACTOR_STATUS_LABELS } from '@/lib/subcontractors'
import { FormActions, FormSection, SelectField, TextField } from '@/components/shared/form-field'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'
import { TradeCombobox } from '@/components/subcontractors/trade-combobox'
import { ProjectAssignmentsPicker, type ProjectPickerAvailability } from '@/components/subcontractors/project-assignments-picker'
import type { AssignableProject } from '@/lib/subcontractor-projects'

export function SubcontractorForm({
  action,
  cancelHref,
  projects,
  projectAvailability,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>
  cancelHref: string
  projects: AssignableProject[]
  projectAvailability: ProjectPickerAvailability
}) {
  const [state, formAction] = useActionState(action, initialActionState)
  const fe = state.fieldErrors ?? {}
  const v = state.values ?? {}
  const formKey = state.values ? JSON.stringify(state.values) : 'initial'

  return (
    <form key={formKey} action={formAction} className="flex flex-col gap-5" noValidate>
      <FormSection icon={HardHatIcon} title="Company" description="The trade partner your team hires for project work.">
        <TextField name="company_name" label="Company name" required defaultValue={v.company_name ?? ''} error={fe.company_name} autoComplete="organization" maxLength={160} />
        <TradeCombobox defaultValue={v.trade ?? ''} error={fe.trade} />
        <SelectField
          name="status"
          label="Status"
          required
          defaultValue={v.status ?? 'active'}
          error={fe.status}
          options={Object.entries(SUBCONTRACTOR_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
        />
      </FormSection>

      <FormSection icon={PhoneIcon} title="Contact" description="How your team reaches this company. Both are optional.">
        <TextField name="email" label="Email" type="email" defaultValue={v.email ?? ''} error={fe.email} autoComplete="email" maxLength={254} />
        <TextField name="phone" label="Phone" type="tel" defaultValue={v.phone ?? ''} error={fe.phone} autoComplete="tel" maxLength={30} />
      </FormSection>

      <FormSection
        icon={FolderKanbanIcon}
        title="Project Assignments"
        description="Choose the projects this subcontractor will work on. You can also assign projects later."
      >
        <ProjectAssignmentsPicker
          projects={projects}
          availability={projectAvailability}
          defaultValue={v.project_ids ?? ''}
          error={fe.project_ids}
        />
      </FormSection>

      <FormActions message={<FormMessage state={state} />}>
        <Button variant="outline" size="lg" render={<Link href={cancelHref} />} nativeButton={false}>
          Cancel
        </Button>
        <SubmitButton pendingLabel="Saving subcontractor…">Save subcontractor</SubmitButton>
      </FormActions>
    </form>
  )
}
