'use client'

import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { setSubcontractorStatusAction } from '@/app/actions/subcontractors'
import type { SubcontractorStatus } from '@/lib/subcontractors'

/** Confirms an activate/deactivate change. Controlled so it can be opened from a menu item or a button. */
export function SubcontractorStatusDialog({
  companyId,
  companyName,
  status,
  open,
  onOpenChange,
}: {
  companyId: string
  companyName: string
  status: SubcontractorStatus
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const inFlight = useRef(false)
  const deactivating = status === 'active'
  const next: SubcontractorStatus = deactivating ? 'inactive' : 'active'

  function confirm() {
    if (inFlight.current) return
    inFlight.current = true
    setError(null)
    startTransition(async () => {
      try {
        const result = await setSubcontractorStatusAction(companyId, next)
        if (result.error) {
          setError(result.error)
          return
        }
        onOpenChange(false)
        toast.success(result.success ?? 'Status updated.')
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
        if (!value) setError(null)
      }}
    >
      <DialogContent showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>{deactivating ? `Deactivate ${companyName}?` : `Activate ${companyName}?`}</DialogTitle>
          <DialogDescription>
            {deactivating
              ? 'They will no longer be offered for new projects or schedule work. Existing project associations and assigned activities are kept as they are.'
              : 'They will be available again for new projects and schedule work.'}
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={deactivating ? 'destructive' : 'default'}
            disabled={pending}
            aria-busy={pending}
            onClick={confirm}
          >
            {pending ? 'Saving...' : deactivating ? 'Deactivate' : 'Activate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Header button variant for the detail page. */
export function SubcontractorStatusButton(props: { companyId: string; companyName: string; status: SubcontractorStatus }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button type="button" variant="outline" size="lg" onClick={() => setOpen(true)}>
        {props.status === 'active' ? 'Deactivate' : 'Activate'}
      </Button>
      <SubcontractorStatusDialog {...props} open={open} onOpenChange={setOpen} />
    </>
  )
}
