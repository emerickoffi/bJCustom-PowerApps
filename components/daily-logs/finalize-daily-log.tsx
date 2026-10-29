'use client'

import { useActionState } from 'react'
import { Lock } from 'lucide-react'
import { finalizeDailyLogAction } from '@/app/actions/daily-logs'
import { initialActionState } from '@/lib/action-state'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'

export function FinalizeDailyLog({ projectId, logId, version }: { projectId: string; logId: string; version: number }) {
  const [state, action] = useActionState(finalizeDailyLogAction, initialActionState)
  if (state.success) return <FormMessage state={state} />
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="id" value={logId} />
      <input type="hidden" name="version" value={version} />
      <label className="flex items-start gap-3 text-sm text-foreground">
        <input type="checkbox" name="confirm" value="yes" required className="mt-0.5 size-4 accent-primary" />
        <span>I confirm this log is complete and accurate. Once finalized it can no longer be edited.</span>
      </label>
      <FormMessage state={state} />
      <div>
        <SubmitButton pendingLabel="Finalizing..." size="default">
          <Lock aria-hidden="true" />
          Finalize log
        </SubmitButton>
      </div>
    </form>
  )
}
