'use client'

import { useState } from 'react'
import { Popover } from '@base-ui/react/popover'
import { Info } from 'lucide-react'

/** Supplementary explanation for a KPI card; a sibling of the card link, never nested inside it. */
export function KpiDetails({ label, details }: { label: string; details: readonly string[] }) {
  const [open, setOpen] = useState(false)

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={`${label} details`}
        className="relative z-10 -mr-1 flex size-8 shrink-0 cursor-pointer items-center justify-center self-start rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-muted data-popup-open:text-foreground"
      >
        <Info className="size-4" aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner className="isolate z-50 outline-none" side="bottom" align="end" sideOffset={6} collisionPadding={12}>
          <Popover.Popup className="flex w-[min(18rem,calc(100vw-1.5rem))] origin-(--transform-origin) flex-col gap-1.5 rounded-lg bg-popover px-3.5 py-3 text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-none duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
            <Popover.Title className="text-sm font-semibold text-foreground">{label}</Popover.Title>
            <Popover.Description render={<div />} className="flex flex-col gap-1 text-xs leading-relaxed text-muted-foreground">
              {details.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </Popover.Description>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
