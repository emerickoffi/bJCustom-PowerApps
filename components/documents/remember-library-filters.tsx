'use client'

import { useEffect } from 'react'
import { libraryFilterCookie, type DocumentLibraryTab } from '@/lib/document-library-filters'

/** Stores the active library's filters so its worksheet tab can restore them after switching libraries. */
export function RememberLibraryFilters({ tab, query }: { tab: DocumentLibraryTab; query: string }) {
  useEffect(() => {
    document.cookie = `${libraryFilterCookie(tab)}=${encodeURIComponent(query)}; path=/documents; max-age=2592000; samesite=lax`
  }, [tab, query])
  return null
}
