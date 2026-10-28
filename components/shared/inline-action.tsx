'use client'

import { useActionState, useEffect, useRef, useTransition, useState } from 'react'
import { Button } from '@/components/ui/button'
import { initialActionState, type ActionState } from '@/lib/action-state'
import { FormMessage } from '@/components/shared/form-message'

/** A small form bound to a server action that resets itself after success. */
export function InlineActionForm({
  action,
  children,
  className,
  onSuccess,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>
  children: React.ReactNode
  className?: string
  onSuccess?: (message: string) => void
}) {
  const [state, formAction] = useActionState(action, initialActionState)
  const formRef = useRef<HTMLFormElement>(null)
  const onSuccessRef = useRef(onSuccess)
  onSuccessRef.current = onSuccess

  useEffect(() => {
    if (!state.success) return
    formRef.current?.reset()
    onSuccessRef.current?.(state.success)
  }, [state])

  return (
    <form ref={formRef} action={formAction} className={className}>
      {children}
      <div className="sm:col-span-full">
        <FormMessage state={state} />
      </div>
    </form>
  )
}

/** A button that runs a server action directly, optionally after confirmation. */
export function ActionButton({
  action,
  label,
  pendingLabel,
  confirmMessage,
  variant = 'ghost',
  size = 'sm',
}: {
  action: () => Promise<ActionState>
  label: string
  pendingLabel?: string
  confirmMessage?: string
  variant?: React.ComponentProps<typeof Button>['variant']
  size?: React.ComponentProps<typeof Button>['size']
}) {
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<ActionState>(initialActionState)

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={pending}
        onClick={() => {
          if (confirmMessage && !window.confirm(confirmMessage)) return
          startTransition(async () => setResult(await action()))
        }}
      >
        {pending ? (pendingLabel ?? 'Working...') : label}
      </Button>
      {result.error && (
        <p role="alert" className="max-w-xs text-right text-xs text-destructive">
          {result.error}
        </p>
      )}
      {result.success && (
        <p role="status" className="max-w-xs text-right text-xs text-muted-foreground">
          {result.success}
        </p>
      )}
    </div>
  )
}
