import Image from 'next/image'
import { PRODUCT_BRAND } from '@/lib/product-brand'
import { cn } from '@/lib/utils'

/** Transparent white-and-orange artwork; only place it on the Trefort teal. */
export function TrefortLogo({ className, priority }: { className?: string; priority?: boolean }) {
  const { src, width, height } = PRODUCT_BRAND.logo
  return (
    <Image
      src={src}
      alt={PRODUCT_BRAND.fullName}
      width={width}
      height={height}
      priority={priority}
      className={cn('h-auto w-full', className)}
    />
  )
}

export function TrefortMark({ className, priority }: { className?: string; priority?: boolean }) {
  const { src, width, height } = PRODUCT_BRAND.mark
  return (
    <Image
      src={src}
      alt={PRODUCT_BRAND.name}
      width={width}
      height={height}
      priority={priority}
      className={cn('h-auto w-full', className)}
    />
  )
}
