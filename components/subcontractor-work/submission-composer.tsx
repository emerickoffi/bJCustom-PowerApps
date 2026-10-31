'use client'

import { useActionState, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MediaUploader } from '@/components/walkthroughs/media-uploader'
import { TextAreaField, TextField } from '@/components/shared/form-field'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'
import { initialActionState } from '@/lib/action-state'
import { SUB_WORK_BUCKET, subEvidencePath, type SubmissionKind } from '@/lib/subcontractor-work'
import type { MediaItem } from '@/lib/walkthroughs'
import {
  registerSubEvidenceAction,
  removeSubEvidenceAction,
  startSubmissionAction,
  submitSubWorkAction,
} from '@/app/actions/subcontractor-work'

type Draft = { id: string; organizationId: string; items: MediaItem[] }

export function SubmissionComposer({
  kind,
  targetId,
  draft,
  today,
  isResubmission,
}: {
  kind: SubmissionKind
  targetId: string
  draft: Draft | null
  today: string
  isResubmission: boolean
}) {
  const router = useRouter()
  const [starting, startTransition] = useTransition()
  const [startError, setStartError] = useState<string | null>(null)
  const submitLabel = kind === 'work' ? 'Submit Work for Inspection' : 'Submit Correction for Verification'

  if (!draft) {
    return (
      <div className="flex flex-col gap-2">
        <Button
          size="lg"
          className="h-12 w-full text-base"
          disabled={starting}
          onClick={() =>
            startTransition(async () => {
              setStartError(null)
              const result = await startSubmissionAction(kind, targetId)
              if (result.error) setStartError(result.error)
              else router.refresh()
            })
          }
        >
          <Camera data-icon="inline-start" />
          {starting ? 'Preparing...' : isResubmission ? 'Start resubmission' : 'Add completion photos'}
        </Button>
        {startError && (
          <p role="alert" className="text-sm text-destructive">
            {startError}
          </p>
        )}
      </div>
    )
  }

  return <DraftForm kind={kind} targetId={targetId} draft={draft} today={today} submitLabel={submitLabel} />
}

function DraftForm({
  kind,
  targetId,
  draft,
  today,
  submitLabel,
}: {
  kind: SubmissionKind
  targetId: string
  draft: Draft
  today: string
  submitLabel: string
}) {
  const [items, setItems] = useState<MediaItem[]>(draft.items)
  const [state, formAction] = useActionState(submitSubWorkAction, initialActionState)
  const step = items.length ? 2 : 1

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <ol className="flex items-center gap-2 text-xs font-medium" aria-label="Submission progress">
        {['Photos', 'Details', 'Submit'].map((label, index) => (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={
                index < step
                  ? 'flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground'
                  : 'flex size-6 items-center justify-center rounded-full border border-border text-muted-foreground'
              }
              aria-current={index === step ? 'step' : undefined}
            >
              {index + 1}
            </span>
            <span className={index <= step ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
          </li>
        ))}
      </ol>

      <input type="hidden" name="submission_id" value={draft.id} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="target_id" value={targetId} />

      <MediaUploader
        items={items}
        onItemsChange={setItems}
        bucket={SUB_WORK_BUCKET}
        evidence="repair"
        label={kind === 'work' ? 'Completion photos (required)' : 'After-repair photos (required)'}
        floatingCameraLabel={kind === 'work' ? 'Completion photos' : 'After-repair photos'}
        pathFor={(fileName) => subEvidencePath(draft.organizationId, draft.id, fileName)}
        register={(meta) => registerSubEvidenceAction(draft.id, 'completion', meta)}
        unregister={(item) => removeSubEvidenceAction(item.id)}
      />

      {kind === 'work' && (
        <TextField
          name="completed_on"
          label="Date work was completed"
          type="date"
          max={today}
          defaultValue={today}
          required
          error={state.fieldErrors?.completed_on}
        />
      )}
      <TextAreaField
        name="notes"
        label={kind === 'work' ? 'Completion notes' : 'Repair notes'}
        rows={4}
        maxLength={5000}
        placeholder={kind === 'work' ? 'What was completed, anything the builder should check' : 'What was repaired and how'}
        error={state.fieldErrors?.notes}
      />

      <FormMessage state={state} />
      <SubmitButton pendingLabel="Submitting..." disabled={!items.length} className="h-12 w-full text-base">
        <Send data-icon="inline-start" />
        {submitLabel}
      </SubmitButton>
      {!items.length && <p className="-mt-3 text-center text-xs text-muted-foreground">Add at least one photo to submit.</p>}
    </form>
  )
}
