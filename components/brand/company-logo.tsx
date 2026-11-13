'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DEFAULT_BRAND, DEFAULT_LOGO_DIMENSIONS, type OrganizationBrand } from '@/lib/branding'

type CompanyLogoProps = {
  brand?: OrganizationBrand
  className?: string
  priority?: boolean
}

/**
 * Renders the organization's own logo, or a neutral company mark with its name when no logo is set
 * or the configured logo fails to load. Never substitutes another company's branding.
 */
export function CompanyLogo({ brand = DEFAULT_BRAND, className, priority }: CompanyLogoProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const src = brand.logoUrl.trim()

  if (!src || failedUrl === src) {
    return (
      <span className={cn('flex min-w-0 items-center gap-2 text-foreground', className)}>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
          <Building2 className="size-5" aria-hidden="true" />
        </span>
        <span className="truncate text-sm font-semibold">{brand.displayName}</span>
      </span>
    )
  }

  return (
    <Image
      src={src}
      alt={`${brand.displayName} logo`}
      width={DEFAULT_LOGO_DIMENSIONS.width}
      height={DEFAULT_LOGO_DIMENSIONS.height}
      priority={priority}
      unoptimized
      onError={() => setFailedUrl(src)}
      className={cn('h-auto w-full object-contain', className)}
    />
  )
}
