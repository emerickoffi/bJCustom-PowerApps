'use client'

import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Compact summary row with a toggle that reveals the full controls. Content stays mounted so form input survives collapsing. */
export function SectionDisclosure({
  summary,
  expandLabel,
  collapseLabel = 'Hide',
  children,
}: {
  summary: React.ReactNode
  expandLabel: string
  collapseLabel?: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
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
          onClick={() => setOpen((v) => !v)}
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
