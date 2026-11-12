'use client'

import { useActionState, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSelectionChangeOrderAction, transitionSelectionAction } from '@/app/actions/selections'
import { initialActionState } from '@/lib/action-state'
import { ACTION_LABELS, NOTE_REQUIRED_ACTIONS, type SelectionAction } from '@/lib/selections'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

const DESTRUCTIVE: ReadonlySet<SelectionAction> = new Set(['reject', 'cancel'])
const PRIMARY: ReadonlySet<SelectionAction> = new Set(['send', 'approve', 'require_change_order'])

export function WorkflowPanel({
  projectId,
  selectionId,
  version,
  actions,
  canCreateChangeOrder,
}: {
  projectId: string
  selectionId: string
  version: number
  actions: SelectionAction[]
  canCreateChangeOrder: boolean
}) {
  const router = useRouter()
  const [state, dispatch] = useActionState(transitionSelectionAction, initialActionState)
  const [coState, coDispatch] = useActionState(createSelectionChangeOrderAction, initialActionState)
  const [chosen, setChosen] = useState<SelectionAction | null>(null)
  const needsNote = chosen ? NOTE_REQUIRED_ACTIONS.has(chosen) : false
  const conflict = state.conflict || coState.conflict

  if (actions.length === 0 && !canCreateChangeOrder) {
    return <p className="text-sm text-muted-foreground">No further actions for this selection.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      {canCreateChangeOrder && (
        <form action={coDispatch} className="flex flex-col gap-2 rounded-xl border border-orange-300/60 bg-orange-50 p-4 dark:bg-orange-950/20">
          <input type="hidden" name="project_id" value={projectId} />
          <input type="hidden" name="selection_id" value={selectionId} />
          <input type="hidden" name="expected_version" value={version} />
          <p className="text-sm text-foreground">The homeowner&apos;s choice differs from the allowance. Create a change order for the difference.</p>
          <SubmitButton size="default" pendingLabel="Creating…" className="self-start">
            Create change order
          </SubmitButton>
          <FormMessage state={coState} />
        </form>
      )}

      {actions.length > 0 && (
        <form action={dispatch} className="flex flex-col gap-3">
          <input type="hidden" name="project_id" value={projectId} />
          <input type="hidden" name="selection_id" value={selectionId} />
          <input type="hidden" name="expected_version" value={version} />
          <input type="hidden" name="action" value={chosen ?? ''} />
          <div className="flex flex-wrap gap-2" role="group" aria-label="Selection actions">
            {actions.map((a) => (
              <Button
                key={a}
                type="button"
                variant={chosen === a ? (DESTRUCTIVE.has(a) ? 'destructive' : 'default') : PRIMARY.has(a) ? 'secondary' : 'outline'}
                aria-pressed={chosen === a}
                onClick={() => setChosen(chosen === a ? null : a)}
              >
                {ACTION_LABELS[a]}
              </Button>
            ))}
          </div>
          {chosen && (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="workflow-note">{needsNote ? 'Note (required)' : 'Note (optional)'}</Label>
                <Textarea
                  id="workflow-note"
                  name="note"
                  rows={3}
                  maxLength={2000}
                  required={needsNote}
                  aria-invalid={state.fieldErrors?.note ? true : undefined}
                  placeholder={needsNote ? 'Tell the homeowner what you need from them.' : undefined}
                />
                {state.fieldErrors?.note && <p className="text-xs text-destructive">{state.fieldErrors.note}</p>}
              </div>
              <SubmitButton size="default" variant={DESTRUCTIVE.has(chosen) ? 'destructive' : 'default'} pendingLabel="Working…" className="self-start">
                {`Confirm: ${ACTION_LABELS[chosen]}`}
              </SubmitButton>
            </>
          )}
          <FormMessage state={state} />
        </form>
      )}

      {conflict && (
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => router.refresh()}>
          Refresh
        </Button>
      )}
    </div>
  )
}
