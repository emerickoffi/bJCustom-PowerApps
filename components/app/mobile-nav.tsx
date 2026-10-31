'use client'

import { useState } from 'react'
import { Menu } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { AppNav } from '@/components/app/app-nav'
import type { NavGroup, NavItem } from '@/lib/navigation'

export function MobileNav({
  items,
  logo,
  closedGroups,
}: {
  items: NavItem[]
  logo: React.ReactNode
  closedGroups?: NavGroup[]
}) {
  const [open, setOpen] = useState(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label="Open navigation"
        className="flex size-11 shrink-0 items-center justify-center rounded-xl text-foreground transition-colors hover:bg-sage/70 lg:hidden"
      >
        <Menu className="size-5" aria-hidden="true" />
      </SheetTrigger>
      <SheetContent side="left" className="flex w-[18rem] flex-col gap-0 bg-sidebar p-0">
        <SheetHeader className="border-b px-6 py-6">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="w-44">{logo}</div>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <AppNav items={items} onNavigate={() => setOpen(false)} closedGroups={closedGroups} />
        </div>
      </SheetContent>
    </Sheet>
  )
}
