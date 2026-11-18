'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { PauseCircle, PlayCircle } from 'lucide-react'
import { setCompanySuspendedAction } from '@/app/actions/platform'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

/** Suspend asks for a reason; reactivate is one confirmation. The server checks permissions again. */
export function CompanySuspension({
  organizationId,
  companyName,
  suspended,
  isOwnCompany,
}: {
  organizationId: string
  companyName: string
  suspended: boolean
  isOwnCompany: boolean
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit() {
    setError(null)
    startTransition(async () => {
      const result = await setCompanySuspendedAction(organizationId, !suspended, reason)
      if (result.error) {
        setError(result.error)
        return
      }
      toast.success(result.success ?? 'Saved.')
      setOpen(false)
      setReason('')
    })
  }

  if (!suspended && isOwnCompany) {
    return <p className="text-sm text-muted-foreground">You belong to this company, so it cannot be suspended from here.</p>
  }

  return (
    <>
      <Button variant={suspended ? 'action' : 'destructive'} onClick={() => setOpen(true)}>
        {suspended ? <PlayCircle data-icon="inline-start" aria-hidden="true" /> : <PauseCircle data-icon="inline-start" aria-hidden="true" />}
        {suspended ? 'Reactivate company' : 'Suspend company'}
      </Button>
      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{suspended ? `Reactivate ${companyName}?` : `Suspend ${companyName}?`}</DialogTitle>
            <DialogDescription>
              {suspended
                ? 'Its team, homeowners and subcontractors get access again right away. Nothing was deleted while it was suspended.'
                : 'Its team, homeowners and subcontractors lose access right away and see a "workspace paused" message. All of its data is kept, and you can reactivate it at any time.'}
            </DialogDescription>
          </DialogHeader>
          {!suspended && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="suspend-reason">Reason</Label>
              <Textarea
                id="suspend-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="For example: payment failed on Nov 17"
                maxLength={500}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">Only Trefort owners see this.</p>
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant={suspended ? 'action' : 'destructive'} onClick={submit} disabled={pending}>
              {pending ? 'Saving...' : suspended ? 'Reactivate' : 'Suspend'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
