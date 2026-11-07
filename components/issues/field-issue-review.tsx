'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TextAreaField } from '@/components/shared/form-field'
import { reviewFieldIssueAction } from '@/app/actions/field-issues'
import type { ActionState } from '@/lib/action-state'

export function FieldIssueReview({ projectId, issueId, updatedAt }: { projectId: string; issueId: string; updatedAt: string }) {
  const router = useRouter()
  const [mode, setMode] = useState<'idle' | 'return'>('idle')
  const [reason, setReason] = useState('')
  const [state, setState] = useState<ActionState>({})
  const [pending, startTransition] = useTransition()

  function submit(decision: 'close' | 'return') {
    if (decision === 'close' && !window.confirm('Close this issue? Closing records that you verified the work. It does not certify safety or code compliance.')) return
    startTransition(async () => {
      const result = await reviewFieldIssueAction(projectId, issueId, decision, decision === 'return' ? reason : '', updatedAt)
      setState(result)
      if (result.success) {
        setMode('idle')
        setReason('')
        router.refresh()
      }
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {mode === 'return' ? (
        <div className="flex flex-col gap-3">
          <TextAreaField
            name="reason"
            label="Why does it need more work?"
            required
            rows={3}
            maxLength={2000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            error={state.fieldErrors?.reason}
            hint="Kept in the history next to the previous resolution."
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => submit('return')} disabled={pending}>
              {pending ? 'Returning...' : 'Return for more work'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setMode('idle')} disabled={pending}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => submit('close')} disabled={pending}>
            <CheckCircle2 className="size-4" aria-hidden="true" />
            {pending ? 'Closing...' : 'Close issue'}
          </Button>
          <Button type="button" variant="outline" onClick={() => setMode('return')} disabled={pending}>
            <RotateCcw className="size-4" aria-hidden="true" />
            Return for more work
          </Button>
        </div>
      )}
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
          {state.conflict && (
            <>
              {' '}
              <button type="button" className="font-medium underline underline-offset-4" onClick={() => router.refresh()}>
                Reload
              </button>
            </>
          )}
        </p>
      )}
      {state.success && (
        <p role="status" className="text-sm text-primary">
          {state.success}
        </p>
      )}
    </div>
  )
}
