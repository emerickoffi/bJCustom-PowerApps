import Image from 'next/image'
import { cn } from '@/lib/utils'

/** Transparent white-and-orange artwork; only place it on the Trefort teal. */
export function TrefortLogo({ className, priority }: { className?: string; priority?: boolean }) {
  return (
    <Image
      src="/branding/trefort-logo.png"
      alt="Trefort Construction Management"
      width={1196}
      height={319}
      priority={priority}
      className={cn('h-auto w-full', className)}
    />
  )
}

export function TrefortMark({ className, priority }: { className?: string; priority?: boolean }) {
  return (
    <Image
      src="/branding/trefort-mark.png"
      alt="Trefort"
      width={151}
      height={186}
      priority={priority}
      className={cn('h-auto w-full', className)}
    />
  )
}
