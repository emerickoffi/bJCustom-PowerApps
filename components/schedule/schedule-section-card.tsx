'use client'

import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useSectionPreference } from '@/components/schedule/use-section-preference'

/**
 * Compact summary row with a toggle that reveals the full controls. Content stays mounted so form input survives
 * collapsing. With a `preferenceKey`, the user's last open/closed choice is remembered on this device.
 */
export function SectionDisclosure({
  summary,
  expandLabel,
  collapseLabel = 'Hide',
  defaultOpen = false,
  preferenceKey,
  children,
}: {
  summary: React.ReactNode
  expandLabel: string
  collapseLabel?: string
  defaultOpen?: boolean
  preferenceKey?: string
  children: React.ReactNode
}) {
  const [localOpen, setLocalOpen] = useState(defaultOpen)
  const [storedOpen, setStoredOpen] = useSectionPreference(preferenceKey, defaultOpen)
  const open = preferenceKey ? storedOpen : localOpen
  const setOpen = preferenceKey ? setStoredOpen : setLocalOpen
  const id = useId()
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0 flex-1 text-sm text-muted-foreground">{summary}</div>
        <Button
          variant="outline"
          size="sm"
          className="min-h-11 shrink-0 sm:min-h-8"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
        >
          {open ? collapseLabel : expandLabel}
          <ChevronDown className={cn('size-4 transition-transform motion-reduce:transition-none', open && 'rotate-180')} aria-hidden="true" />
        </Button>
      </div>
      <div id={id} hidden={!open} className="border-t border-border px-4 py-4">
        {children}
      </div>
    </>
  )
}
