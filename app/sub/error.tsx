'use client'

import { useEffect } from 'react'
import { RouteError } from '@/components/shared/route-states'
import { recordHelpError } from '@/lib/help-errors'

export default function SubPortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // Lets a help request from this screen include the error ID support can look up in the server logs.
  useEffect(() => {
    recordHelpError(`Page failed to load${error.digest ? ` (error ID ${error.digest})` : ''}: ${error.message}`)
  }, [error])
  return <RouteError reset={reset} homeHref="/sub" />
}
