'use client'

import { useSearchParams } from 'next/navigation'
import { parseView } from '@/lib/contacts'
import { useLauncherAction } from '@/components/app/floating-actions'
import { useOverlayHref } from '@/components/contacts/contact-overlays'

/** The directory's create actions on the shared launcher. The active tab (mirrored into ?view=) sits nearest. */
export function ContactsCreateAction() {
  const searchParams = useSearchParams()
  const overlayHref = useOverlayHref()
  const isPeople = parseView(searchParams.get('view')) === 'people'

  useLauncherAction({
    id: 'create-contact',
    label: 'Add contact',
    icon: 'contact',
    href: overlayHref({ new: 'contact' }),
    scroll: false,
    priority: isPeople ? 0 : 1,
  })
  useLauncherAction({
    id: 'create-company',
    label: 'Add company',
    icon: 'company',
    href: overlayHref({ new: 'company' }),
    scroll: false,
    priority: isPeople ? 1 : 0,
  })
  return null
}
