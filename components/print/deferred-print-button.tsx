'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'

type DeferredPrintButtonProps = {
  size?: React.ComponentProps<typeof Button>['size']
}

/**
 * window.print() is synchronous: the browser lays out every printable page
 * before returning, so calling it inside the click handler blocks the next
 * paint for the full print-preview build. Paint the pending state first,
 * then open the print dialog from a fresh task.
 */
export function DeferredPrintButton({ size }: DeferredPrintButtonProps) {
  const [pending, setPending] = useState(false)
  const pendingRef = useRef(false)
  const mountedRef = useRef(false)
  const scheduledRef = useRef<{ frame: number; timeout: number }>({ frame: 0, timeout: 0 })

  useEffect(() => {
    mountedRef.current = true
    const reset = () => {
      pendingRef.current = false
      if (mountedRef.current) setPending(false)
    }
    window.addEventListener('afterprint', reset)
    return () => {
      mountedRef.current = false
      cancelAnimationFrame(scheduledRef.current.frame)
      clearTimeout(scheduledRef.current.timeout)
      window.removeEventListener('afterprint', reset)
    }
  }, [])

  function handleClick() {
    if (pendingRef.current) return
    pendingRef.current = true
    setPending(true)

    scheduledRef.current.frame = requestAnimationFrame(() => {
      scheduledRef.current.timeout = window.setTimeout(() => {
        try {
          window.print()
        } finally {
          // Some browsers never fire afterprint; print() returning means the dialog closed.
          pendingRef.current = false
          if (mountedRef.current) setPending(false)
        }
      }, 0)
    })
  }

  return (
    <Button size={size} onClick={handleClick} disabled={pending} aria-busy={pending}>
      {pending ? (
        <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden="true" />
      ) : (
        <Printer data-icon="inline-start" />
      )}
      {pending ? 'Preparing print preview…' : 'Print or save as PDF'}
    </Button>
  )
}
