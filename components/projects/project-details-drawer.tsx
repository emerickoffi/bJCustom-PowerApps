'use client'

import type { ReactNode } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'

/**
 * Holds the less-frequent project metadata, status changes and history so the Overview stays scannable.
 * It has no button of its own: "Project details" in the project facts row opens it from every tab by
 * adding `?details=open`, and closing removes the flag so a refresh or a remembered tab doesn't reopen it.
 */
export function ProjectDetailsDrawer({ projectName, children }: { projectName: string; children: ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const open = searchParams.get('details') === 'open'

  const close = () => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('details')
    const query = params.toString()
    window.history.replaceState(window.history.state, '', `${pathname}${query ? `?${query}` : ''}${window.location.hash}`)
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) close()
      }}
    >
      <SheetContent side="right" className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle>Project details</SheetTitle>
          <SheetDescription>{projectName}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-6 px-4 pb-8">{children}</div>
      </SheetContent>
    </Sheet>
  )
}
