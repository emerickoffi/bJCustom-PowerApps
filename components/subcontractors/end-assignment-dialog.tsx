'use client'

import { useId, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { endProjectAssignmentAction } from '@/app/actions/subcontractors'
import { MAX_END_REASON_LENGTH } from '@/lib/subcontractor-projects'

/**
 * Confirms ending one project assignment. When scheduled work is still active, the user must explicitly choose to
 * keep it before ending; nothing on the schedule is revoked here.
 */
export function EndAssignmentDialog({
  companyId,
  assignmentId,
  projectLabel,
  activeWork,
  open,
  onOpenChange,
}: {
  companyId: string
  assignmentId: string
  projectLabel: string
  /** Active scheduled activity names, or null when they could not be loaded. */
  activeWork: string[] | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [keepWork, setKeepWork] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [pending, startTransition] = useTransition()
  const inFlight = useRef(false)
  const ids = useId()
  const hasActiveWork = Boolean(activeWork?.length) || conflict
  const blocked = hasActiveWork && !keepWork

  function reset() {
    setError(null)
    setReason('')
    setKeepWork(false)
    setConflict(false)
  }

  function confirm() {
    if (inFlight.current || blocked) return
    inFlight.current = true
    setError(null)
    startTransition(async () => {
      try {
        const result = await endProjectAssignmentAction(companyId, assignmentId, { reason, keepActiveWork: keepWork })
        if (result.error) {
          if (result.activeWorkConflict) setConflict(true)
          setError(result.error)
          return
        }
        onOpenChange(false)
        reset()
        toast.success(result.success ?? 'Assignment ended.')
      } catch {
        setError('Something went wrong. Nothing was changed. Please try again.')
      } finally {
        inFlight.current = false
      }
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (pending) return
        onOpenChange(value)
        if (!value) reset()
      }}
    >
      <DialogContent showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>End assignment?</DialogTitle>
          <DialogDescription>
            {`${projectLabel} moves to Project History. The record is kept, and schedule activities, daily logs, and financial records are not changed.`}
          </DialogDescription>
        </DialogHeader>

        {hasActiveWork && (
          <div role="alert" className="flex flex-col gap-3 rounded-lg border border-amber-300/70 bg-amber-50 p-3 text-sm text-amber-950">
            <p className="flex items-start gap-2 font-medium">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {activeWork?.length
                ? `Still assigned to ${activeWork.length} active scheduled ${activeWork.length === 1 ? 'activity' : 'activities'} on this project`
                : 'Still assigned to active scheduled work on this project'}
            </p>
            {activeWork && activeWork.length > 0 && (
              <ul className="ml-6 list-disc text-amber-900">
                {activeWork.slice(0, 5).map((name, i) => (
                  <li key={`${name}-${i}`}>{name}</li>
                ))}
                {activeWork.length > 5 && <li>{`and ${activeWork.length - 5} more`}</li>}
              </ul>
            )}
            <label htmlFor={`${ids}-keep`} className="flex items-start gap-2">
              <input
                id={`${ids}-keep`}
                type="checkbox"
                checked={keepWork}
                onChange={(e) => setKeepWork(e.target.checked)}
                disabled={pending}
                className="mt-0.5 size-4 shrink-0 accent-primary"
              />
              <span>Keep this scheduled work as is. I will reassign or revoke it from the project schedule if needed.</span>
            </label>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-reason`}>
            Reason <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Textarea
            id={`${ids}-reason`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={MAX_END_REASON_LENGTH}
            rows={2}
            disabled={pending}
            placeholder="For example, scope complete"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={pending || blocked} aria-busy={pending} onClick={confirm}>
            {pending ? 'Ending...' : 'End assignment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
