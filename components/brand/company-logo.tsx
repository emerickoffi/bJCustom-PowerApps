import Image from 'next/image'
import { cn } from '@/lib/utils'
import { DEFAULT_BRAND, DEFAULT_LOGO_DIMENSIONS, type OrganizationBrand } from '@/lib/branding'

type CompanyLogoProps = {
  brand?: OrganizationBrand
  className?: string
  priority?: boolean
}

/** Renders the organization's logo while preserving its original proportions. */
export function CompanyLogo({ brand = DEFAULT_BRAND, className, priority }: CompanyLogoProps) {
  const isDefault = brand.logoUrl === DEFAULT_BRAND.logoUrl
  return (
    <Image
      src={brand.logoUrl}
      alt={`${brand.displayName} logo`}
      width={DEFAULT_LOGO_DIMENSIONS.width}
      height={DEFAULT_LOGO_DIMENSIONS.height}
      priority={priority}
      unoptimized={!isDefault}
      className={cn('h-auto w-full object-contain', className)}
    />
  )
}
