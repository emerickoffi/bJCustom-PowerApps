'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Building2, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { parseView } from '@/lib/contacts'
import { useOverlayHref } from '@/components/contacts/contact-overlays'

/** The header's single create action. It follows the active tab, which the directory mirrors into ?view=. */
export function ContactsPrimaryAction() {
  const searchParams = useSearchParams()
  const overlayHref = useOverlayHref()
  const isPeople = parseView(searchParams.get('view')) === 'people'
  const Icon = isPeople ? UserPlus : Building2

  return (
    <Button size="lg" render={<Link href={overlayHref({ new: isPeople ? 'contact' : 'company' })} scroll={false} />} nativeButton={false}>
      <Icon data-icon="inline-start" />
      {isPeople ? 'Add contact' : 'Add company'}
    </Button>
  )
}
