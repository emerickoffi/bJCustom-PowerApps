'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { validateRepairAction } from '@/app/actions/walkthroughs'
import { initialActionState } from '@/lib/action-state'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'

export function RepairValidation({ issueId }: { issueId: string }) {
  const [rejecting, setRejecting] = useState(false)
  const [acceptState, acceptAction] = useActionState(validateRepairAction.bind(null, issueId, true), initialActionState)
  const [rejectState, rejectAction] = useActionState(validateRepairAction.bind(null, issueId, false), initialActionState)
  const noteId = `reject-note-${issueId}`

  if (rejecting) {
    return (
      <form action={rejectAction} className="flex flex-col gap-3">
        <label htmlFor={noteId} className="text-sm font-medium text-foreground">
          What still needs attention?
        </label>
        <Textarea id={noteId} name="note" required maxLength={2000} rows={3} className="text-base sm:text-sm" />
        <FormMessage state={rejectState} />
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" size="lg" onClick={() => setRejecting(false)}>
            Cancel
          </Button>
          <SubmitButton variant="destructive" pendingLabel="Sending...">
            Send back to builder
          </SubmitButton>
        </div>
      </form>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <form action={acceptAction} className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" size="lg" onClick={() => setRejecting(true)}>
          Still needs work
        </Button>
        <SubmitButton pendingLabel="Confirming...">Confirm repair</SubmitButton>
      </form>
      <FormMessage state={acceptState} />
    </div>
  )
}
