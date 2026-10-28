'use client'

import { useRef, useState, useTransition } from 'react'
import { AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { ActionState } from '@/lib/action-state'

/**
 * A destructive trigger that only runs its server action after the user
 * confirms in an accessible dialog. Toasts success only once the server
 * reports it; on failure the dialog stays open with the error.
 */
export function ConfirmActionButton({
  action,
  label,
  title,
  description,
  warning,
  confirmLabel,
  pendingLabel = 'Removing...',
  variant = 'ghost',
  size = 'sm',
}: {
  action: () => Promise<ActionState>
  label: string
  title: string
  description: React.ReactNode
  warning?: React.ReactNode
  confirmLabel: string
  pendingLabel?: string
  variant?: React.ComponentProps<typeof Button>['variant']
  size?: React.ComponentProps<typeof Button>['size']
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const inFlight = useRef(false)

  function confirm() {
    if (inFlight.current) return
    inFlight.current = true
    setError(null)
    startTransition(async () => {
      try {
        const result = await action()
        if (result.error) {
          setError(result.error)
          return
        }
        setOpen(false)
        toast.success(result.success ?? 'Done.')
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
      onOpenChange={(next) => {
        if (pending) return
        setOpen(next)
        if (!next) setError(null)
      }}
    >
      <Button type="button" variant={variant} size={size} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <DialogContent showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {warning && (
          <div className="flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>{warning}</p>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={pending} aria-busy={pending} onClick={confirm}>
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
