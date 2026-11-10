'use client'

import { useSearchParams } from 'next/navigation'
import { parseView } from '@/lib/contacts'
import { FloatingCreateAction } from '@/components/app/floating-create-action'
import { useOverlayHref } from '@/components/contacts/contact-overlays'

/** The directory's single create action. It follows the active tab, which the directory mirrors into ?view=. */
export function ContactsCreateAction() {
  const searchParams = useSearchParams()
  const overlayHref = useOverlayHref()
  const isPeople = parseView(searchParams.get('view')) === 'people'

  return (
    <FloatingCreateAction
      href={overlayHref({ new: isPeople ? 'contact' : 'company' })}
      label={isPeople ? 'Add contact' : 'Add company'}
      icon={isPeople ? 'person' : 'company'}
      scroll={false}
    />
  )
}
