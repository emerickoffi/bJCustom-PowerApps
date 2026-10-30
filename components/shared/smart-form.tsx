'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import type { ActionState } from '@/lib/action-state'
import { OverlayBody, OverlayFooter, useFormOverlay } from '@/components/shared/form-overlay'

const DISCARD_PROMPT = 'You have unsaved changes. Discard them and leave this page?'

/**
 * Tracks unsaved work by comparing the serialized form to its first render. This catches every control,
 * including comboboxes and card lists that only update hidden inputs, without false positives when a
 * change is undone.
 */
export function useFormDirty(formKey: string, onChange?: (dirty: boolean) => void) {
  const formRef = useRef<HTMLFormElement>(null)
  const initialRef = useRef<string | null>(null)
  const [dirty, setDirty] = useState(false)

  const serialize = () =>
    formRef.current
      ? JSON.stringify([...new FormData(formRef.current)].filter(([k]) => !k.startsWith('$ACTION')).map(([k, v]) => [k, String(v)]))
      : ''

  const check = useCallback(() => {
    requestAnimationFrame(() => {
      if (!formRef.current || initialRef.current === null) return
      const next = serialize() !== initialRef.current
      setDirty(next)
      onChange?.(next)
    })
  }, [onChange])

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (initialRef.current === null) initialRef.current = serialize()
      else check()
    })
    return () => cancelAnimationFrame(id)
  }, [formKey, check])

  return { formRef, dirty, check }
}

/**
 * Shared behavior for create/edit forms that render both as a full page and inside a FormOverlay drawer:
 * dirty tracking, a leave-page warning on full pages, and scrolling the first error into view.
 */
export function useSmartForm(state: ActionState, formKey: string) {
  const overlay = useFormOverlay()
  const { formRef, dirty, check } = useFormDirty(formKey, overlay?.setDirty)

  useEffect(() => {
    if (!state.error) return
    const id = requestAnimationFrame(() => {
      const first = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], [role="alert"]')
      first?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      if (first?.matches('input, select, textarea')) first.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(id)
  }, [state, formRef])

  useEffect(() => {
    if (overlay || !dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [overlay, dirty])

  const formProps = {
    ref: formRef,
    noValidate: true,
    onInput: check,
    onChange: check,
    // Events from portaled popups bubble through the React tree, so option clicks land here too.
    onClick: check,
    onKeyUp: check,
    className: overlay ? 'flex min-h-0 flex-1 flex-col' : 'flex flex-col gap-5',
  }

  return { overlay, inOverlay: Boolean(overlay), dirty, formProps }
}

/**
 * Renders form sections plus Cancel/Submit. In a drawer the body scrolls and the actions are pinned;
 * on a full page the actions sit in a sticky bar under the sections.
 */
export function SmartFormLayout({
  dirty,
  message,
  cancelHref,
  submit,
  children,
}: {
  dirty: boolean
  message?: React.ReactNode
  cancelHref: string
  submit: React.ReactNode
  children: React.ReactNode
}) {
  const overlay = useFormOverlay()
  const note = (
    <p className="mr-auto hidden text-xs text-muted-foreground sm:block" aria-live="polite">
      {dirty ? 'Unsaved changes' : 'Fields marked * are required.'}
    </p>
  )

  if (overlay) {
    return (
      <>
        <OverlayBody className="py-1">{children}</OverlayBody>
        <OverlayFooter message={message}>
          {note}
          <Button type="button" variant="outline" size="lg" onClick={overlay.requestClose}>
            Cancel
          </Button>
          {submit}
        </OverlayFooter>
      </>
    )
  }

  return (
    <>
      {children}
      <div className="sticky bottom-0 z-10 flex flex-col gap-3 rounded-xl border border-border/80 bg-card/95 p-4 shadow-sm backdrop-blur supports-backdrop-filter:bg-card/85">
        {message}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          {note}
          <Button
            variant="outline"
            size="lg"
            render={
              <Link
                href={cancelHref}
                onClick={(e) => {
                  if (dirty && !window.confirm(DISCARD_PROMPT)) e.preventDefault()
                }}
              />
            }
            nativeButton={false}
          >
            Cancel
          </Button>
          {submit}
        </div>
      </div>
    </>
  )
}
