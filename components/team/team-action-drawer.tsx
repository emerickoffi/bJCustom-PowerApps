'use client'

import { Mail, UserRoundPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

const ICONS = { create: UserRoundPlus, invite: Mail }

export function TeamActionDrawer({
  kind,
  label,
  title,
  description,
  variant = 'default',
  children,
}: {
  kind: keyof typeof ICONS
  label: string
  title: string
  description: string
  variant?: 'default' | 'outline'
  children: React.ReactNode
}) {
  const Icon = ICONS[kind]
  return (
    // Pointer dismissal is off so a stray click can't close the drawer while a one-time password is displayed.
    <Sheet disablePointerDismissal>
      <SheetTrigger render={<Button variant={variant} />}>
        <Icon data-icon="inline-start" />
        {label}
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-lg data-[side=right]:sm:max-w-lg">
        <SheetHeader className="border-b px-6 py-5 pr-12">
          <SheetTitle className="font-serif text-lg font-semibold">{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-5 [&>section]:border-0 [&>section]:bg-transparent [&>section]:p-0 [&>section>div:first-child]:hidden">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  )
}
