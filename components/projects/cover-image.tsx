'use client'

import { useState, type ReactNode } from 'react'

/**
 * Renders a signed cover URL and swaps to the placeholder if the request fails
 * (expired signed URL, deleted object, revoked access) instead of a broken image.
 */
export function CoverImage({
  src,
  alt,
  className,
  fallback,
  overlay,
  priority = false,
}: {
  src: string
  alt: string
  className?: string
  fallback: ReactNode
  /** Rendered only while the image is displayed, e.g. a "Planned design" badge. */
  overlay?: ReactNode
  priority?: boolean
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)

  if (failedSrc === src) return <>{fallback}</>

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URLs are short-lived */}
      <img
        src={src}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : undefined}
        decoding="async"
        className={className}
        onError={() => setFailedSrc(src)}
      />
      {overlay}
    </>
  )
}
