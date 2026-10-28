'use client'

import { RouteError } from '@/components/shared/route-states'

export default function PortalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError reset={reset} homeHref="/portal" />
}
