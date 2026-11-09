'use client'

import { useState, type ReactNode } from 'react'
import { Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'

/** Holds the less-frequent project metadata, status changes and history so the Overview stays scannable. */
export function ProjectDetailsDrawer({
  projectName,
  defaultOpen = false,
  children,
}: {
  projectName: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Info data-icon="inline-start" />
        Project details
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-lg">
          <SheetHeader className="border-b">
            <SheetTitle>Project details</SheetTitle>
            <SheetDescription>{projectName}</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-6 px-4 pb-8">{children}</div>
        </SheetContent>
      </Sheet>
    </>
  )
}
