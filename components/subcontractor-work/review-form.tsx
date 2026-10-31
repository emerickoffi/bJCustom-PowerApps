'use client'

import { useActionState, useState } from 'react'
import { MediaUploader } from '@/components/walkthroughs/media-uploader'
import { TextAreaField } from '@/components/shared/form-field'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'
import { initialActionState } from '@/lib/action-state'
import { SUB_WORK_BUCKET, subEvidencePath, type ReviewDecision, type SubmissionKind } from '@/lib/subcontractor-work'
import type { MediaItem } from '@/lib/walkthroughs'
import { registerSubEvidenceAction, reviewSubSubmissionAction } from '@/app/actions/subcontractor-work'

export type LinkableIssue = { id: string; label: string; assignedElsewhere: boolean }

const DECISIONS: { value: ReviewDecision; label: string; hint: string }[] = [
  { value: 'accepted', label: 'Accept work', hint: 'Verified complete. Does not change the schedule or trigger payment.' },
  { value: 'correction_required', label: 'Request correction', hint: 'Deficiencies found. The subcontractor is asked to fix and resubmit.' },
  { value: 'returned', label: 'Return as incomplete', hint: 'Not ready for inspection. Explain what is missing.' },
]

export function ReviewForm({
  submissionId,
  projectId,
  organizationId,
  kind,
  inspection,
  issues,
}: {
  submissionId: string
  projectId: string
  organizationId: string
  kind: SubmissionKind
  inspection: MediaItem[]
  issues: LinkableIssue[]
}) {
  const [state, formAction] = useActionState(reviewSubSubmissionAction, initialActionState)
  const [decision, setDecision] = useState<ReviewDecision | null>(null)
  const [items, setItems] = useState<MediaItem[]>(inspection)

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="submission_id" value={submissionId} />
      <input type="hidden" name="project_id" value={projectId} />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium text-foreground">
          {kind === 'work' ? 'Review completed work' : 'Review completed correction'}
        </legend>
        {DECISIONS.map((d) => (
          <label
            key={d.value}
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
          >
            <input
              type="radio"
              name="decision"
              value={d.value}
              required
              className="mt-1 size-4 accent-primary"
              onChange={() => setDecision(d.value)}
            />
            <span className="flex flex-col">
              <span className="text-sm font-medium text-foreground">{d.label}</span>
              <span className="text-xs text-muted-foreground">{d.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {kind === 'work' && decision === 'correction_required' && (
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-sm font-medium text-foreground">Link punch list items (optional)</legend>
          {issues.length ? (
            issues.map((issue) => (
              <label key={issue.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                <input type="checkbox" name="issue_ids" value={issue.id} className="size-4 accent-primary" />
                <span className="text-foreground">{issue.label}</span>
                {issue.assignedElsewhere && <span className="text-xs text-muted-foreground">(reassigns to this subcontractor)</span>}
              </label>
            ))
          ) : (
            <p className="text-xs text-muted-foreground">
              No open punch list items on this project. Record findings in the notes, or log them through a walkthrough first.
            </p>
          )}
          <p className="text-xs text-muted-foreground">Linked items are assigned to this subcontractor. Existing items are reused, never duplicated.</p>
        </fieldset>
      )}

      <TextAreaField
        name="notes"
        label="Verification notes"
        rows={4}
        maxLength={5000}
        required={decision !== null && decision !== 'accepted'}
        hint={decision && decision !== 'accepted' ? 'Required. The subcontractor sees these notes.' : 'The subcontractor sees these notes.'}
        error={state.fieldErrors?.notes}
      />

      <MediaUploader
        items={items}
        onItemsChange={setItems}
        bucket={SUB_WORK_BUCKET}
        evidence="original"
        label="Inspection photos (optional)"
        floatingCameraLabel="Inspection photos"
        pathFor={(fileName) => subEvidencePath(organizationId, submissionId, fileName)}
        register={(meta) => registerSubEvidenceAction(submissionId, 'inspection', meta)}
      />

      <FormMessage state={state} />
      <SubmitButton pendingLabel="Recording...">Record verification</SubmitButton>
    </form>
  )
}
