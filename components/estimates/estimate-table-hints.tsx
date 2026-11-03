'use client'

import Link from 'next/link'
import { FileText, Info } from 'lucide-react'
import { Popover } from '@base-ui/react/popover'
import { Tooltip } from '@base-ui/react/tooltip'

const POPUP_CLASS =
  'z-50 max-w-64 rounded-lg border border-[#D6DDE5] bg-white px-3 py-2 text-left text-xs font-normal leading-relaxed normal-case tracking-normal text-[#17212B] shadow-md outline-none'

/** Opens on hover, focus + Enter/Space, or tap, so the definition is reachable without a pointer. */
export function ConstructionTotalInfo() {
  return (
    <Popover.Root>
      <Popover.Trigger
        openOnHover
        delay={150}
        aria-label="What construction total includes"
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[#526173] transition-colors hover:text-[#006B78] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#006B78]"
      >
        <Info className="size-3.5" aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="top" sideOffset={6} className="z-50">
          <Popover.Popup className={POPUP_CLASS}>
            <Popover.Title className="font-medium">Construction total</Popover.Title>
            <Popover.Description className="mt-1 text-[#526173]">
              Direct costs (materials, labor and other) plus allowances, markup and contingency. Land cost is
              excluded and shown separately on each estimate.
            </Popover.Description>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

export function EstimatePdfAction({ estimateId, estimateNumber }: { estimateId: string; estimateNumber: string }) {
  const label = `Open PDF for ${estimateNumber}`
  return (
    <Tooltip.Provider delay={200}>
      <Tooltip.Root>
        <Tooltip.Trigger
          render={
            <Link
              href={`/print/estimates/${estimateId}`}
              target="_blank"
              aria-label={label}
              className="inline-flex size-9 items-center justify-center rounded-md text-[#526173] transition-colors hover:bg-[#E6F3F4] hover:text-[#006B78] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#006B78]"
            />
          }
        >
          <FileText className="size-4" aria-hidden="true" />
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Positioner side="top" sideOffset={6} className="z-50">
            <Tooltip.Popup className={POPUP_CLASS}>{label}</Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}
