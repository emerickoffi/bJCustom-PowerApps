'use client'

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { AlertTriangle, XIcon } from 'lucide-react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'

/**
 * One responsive container for every quick action (centered modal) and medium-complexity edit (right drawer).
 * It never discards typed input silently: while the form is dirty, the close button, Escape, and outside clicks
 * show an in-panel "Discard changes?" prompt instead of closing (no nested dialog stack).
 */

type OverlayContextValue = {
  /** Call from any input change so the overlay knows there is unsaved work. */
  markDirty: () => void
  setDirty: (dirty: boolean) => void
  /** Asks to close. Prompts first when the form has unsaved changes. */
  requestClose: () => void
  /** Closes immediately, for example after a confirmed successful save. */
  forceClose: () => void
}

const OverlayContext = createContext<OverlayContextValue | null>(null)

export function useFormOverlay() {
  return useContext(OverlayContext)
}

export type FormOverlayVariant = 'modal' | 'drawer'

export function FormOverlay({
  open,
  onClose,
  variant,
  title,
  description,
  icon: Icon,
  size = 'md',
  children,
}: {
  open: boolean
  /** Called only once closing is allowed (clean form, confirmed discard, or saved). */
  onClose: () => void
  variant: FormOverlayVariant
  title: React.ReactNode
  description?: React.ReactNode
  icon?: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>
  size?: 'md' | 'lg'
  children: React.ReactNode
}) {
  const [dirty, setDirtyState] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const dirtyRef = useRef(false)
  const discardRef = useRef<HTMLButtonElement>(null)

  const setDirty = useCallback((next: boolean) => {
    dirtyRef.current = next
    setDirtyState(next)
    if (!next) setConfirming(false)
  }, [])

  const forceClose = useCallback(() => {
    dirtyRef.current = false
    setDirtyState(false)
    setConfirming(false)
    onClose()
  }, [onClose])

  const requestClose = useCallback(() => {
    if (dirtyRef.current) {
      setConfirming(true)
      requestAnimationFrame(() => discardRef.current?.focus())
      return
    }
    forceClose()
  }, [forceClose])

  const ctx = useMemo<OverlayContextValue>(
    () => ({ markDirty: () => !dirtyRef.current && setDirty(true), setDirty, requestClose, forceClose }),
    [setDirty, requestClose, forceClose],
  )

  const isDrawer = variant === 'drawer'

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && requestClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          className={cn(
            'fixed inset-0 z-50 bg-foreground/20 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-[2px]',
          )}
        />
        <DialogPrimitive.Popup
          data-variant={variant}
          className={cn(
            'fixed z-50 flex flex-col bg-background text-sm text-foreground shadow-xl outline-none transition duration-200 ease-out',
            // Mobile: full-screen sheet for both variants so fields are never clipped.
            'inset-0 h-dvh w-full data-ending-style:opacity-0 data-starting-style:opacity-0 data-ending-style:translate-y-4 data-starting-style:translate-y-4',
            isDrawer
              ? cn(
                  'sm:inset-y-0 sm:right-0 sm:left-auto sm:h-full sm:border-l sm:border-border/80 sm:data-ending-style:translate-x-10 sm:data-ending-style:translate-y-0 sm:data-starting-style:translate-x-10 sm:data-starting-style:translate-y-0',
                  size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-xl',
                )
              : cn(
                  'sm:inset-auto sm:top-1/2 sm:left-1/2 sm:h-auto sm:max-h-[min(88dvh,56rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:ring-1 sm:ring-foreground/10 sm:data-ending-style:scale-[0.98] sm:data-ending-style:-translate-y-1/2 sm:data-starting-style:scale-[0.98] sm:data-starting-style:-translate-y-1/2',
                  size === 'lg' ? 'sm:max-w-3xl' : 'sm:max-w-2xl',
                ),
          )}
        >
          <OverlayContext.Provider value={ctx}>
            <header className="flex shrink-0 items-start gap-3 border-b border-border/70 bg-card px-5 py-4 sm:px-6 sm:py-5">
              {Icon && (
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sage text-primary ring-1 ring-inset ring-primary/10">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5">
                <DialogPrimitive.Title className="font-serif text-lg leading-tight font-semibold text-balance">{title}</DialogPrimitive.Title>
                {description && (
                  <DialogPrimitive.Description className="text-sm leading-relaxed text-pretty text-muted-foreground">
                    {description}
                  </DialogPrimitive.Description>
                )}
              </div>
              <Button type="button" variant="ghost" size="icon" className="-mt-1 -mr-2 shrink-0" onClick={requestClose}>
                <XIcon aria-hidden="true" />
                <span className="sr-only">Close</span>
              </Button>
            </header>

            {confirming && dirty && (
              <div
                role="alertdialog"
                aria-labelledby="overlay-discard-title"
                className="flex shrink-0 flex-col gap-3 border-b border-amber-300/70 bg-amber-50 px-5 py-3.5 text-amber-950 sm:flex-row sm:items-center sm:px-6 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100"
              >
                <p id="overlay-discard-title" className="flex flex-1 items-start gap-2 text-sm">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>
                    <strong className="font-medium">You have unsaved changes.</strong> Discard them and close?
                  </span>
                </p>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" className="bg-background" onClick={() => setConfirming(false)}>
                    Keep editing
                  </Button>
                  <Button ref={discardRef} type="button" size="sm" variant="destructive" onClick={forceClose}>
                    Discard changes
                  </Button>
                </div>
              </div>
            )}

            <div className="flex min-h-0 flex-1 flex-col">{children}</div>
          </OverlayContext.Provider>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/** Scrollable body. Pair with OverlayFooter inside the same <form> so actions stay pinned. */
export function OverlayBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6', className)}>{children}</div>
}

export function OverlayFooter({ message, children }: { message?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex shrink-0 flex-col gap-3 border-t border-border/70 bg-card px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:px-6">
      {message}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">{children}</div>
    </div>
  )
}
