'use client'

import Link from 'next/link'
import { Building2, Plus, UserPlus, UserRoundPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FloatingActionSlot } from '@/components/app/floating-actions'

export type FloatingCreateIcon = 'person' | 'company' | 'client'

function CreateIcon({ icon }: { icon: FloatingCreateIcon }) {
  if (icon === 'person') return <UserPlus className="size-6" aria-hidden="true" />
  if (icon === 'client') return <UserRoundPlus className="size-6" aria-hidden="true" />
  return (
    <>
      <Building2 className="size-6 -translate-x-0.5 translate-y-0.5" aria-hidden="true" />
      <span className="absolute right-0.5 top-0.5 flex size-[1.125rem] items-center justify-center rounded-full bg-action-foreground text-action">
        <Plus className="size-3.5" strokeWidth={3} aria-hidden="true" />
      </span>
    </>
  )
}

/**
 * A listing page's one creation action, placed in the shared floating stack directly above the AI Assistant.
 * It opens the page's existing creation form and steps aside while any form overlay covers the page.
 */
export function FloatingCreateAction({
  href,
  label,
  icon,
  scroll,
}: {
  href: string
  label: string
  icon: FloatingCreateIcon
  /** False for forms opened by a search parameter on the same page, so the list keeps its scroll position. */
  scroll?: boolean
}) {
  return (
    <FloatingActionSlot slot="create" data-yields-to-overlay className="transition-opacity duration-150">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-full top-1/2 mr-3 -translate-y-1/2 whitespace-nowrap rounded-lg bg-brand-deep px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-has-[:focus-visible]:opacity-100"
      >
        {label}
      </span>
      <Button
        size="icon"
        aria-label={label}
        render={<Link href={href} scroll={scroll} />}
        nativeButton={false}
        // The shared button resets the outline style, so its focus outline needs the style restored to show.
        className="size-12 shadow-lg duration-150 ease-out focus-visible:outline-solid motion-safe:active:scale-[0.97] motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:shadow-[0_12px_18px_-4px_rgb(23_33_43/0.16),0_5px_8px_-4px_rgb(23_33_43/0.12)]"
      >
        <CreateIcon icon={icon} />
      </Button>
    </FloatingActionSlot>
  )
}
