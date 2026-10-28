'use client'

import { useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

/**
 * Lets a link (e.g. Quick Actions) open an existing dialog by adding `?name=value`.
 * The flag is removed after it fires so a refresh or Back does not reopen the dialog.
 */
export function useOpenFromUrl(name: string, value: string, enabled: boolean, onOpen: () => void) {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const matched = enabled && searchParams.get(name) === value

  useEffect(() => {
    if (!matched) return
    onOpen()
    const next = new URLSearchParams(searchParams.toString())
    next.delete(name)
    const query = next.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }, [matched, name, onOpen, pathname, router, searchParams])
}
