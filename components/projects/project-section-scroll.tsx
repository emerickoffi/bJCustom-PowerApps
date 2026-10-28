'use client'

import { useEffect } from 'react'
import { isProjectSectionId } from '@/lib/project-nav'

export function scrollToProjectSection(id: string) {
  const target = document.getElementById(id)
  if (!target) return false
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
  return true
}

// Next.js drops a hash scroll when the target is absent from the loading skeleton,
// so the overview scrolls to its own section once the real content has mounted.
export function ProjectSectionScroll() {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1))
    if (id && isProjectSectionId(id)) scrollToProjectSection(id)
  }, [])
  return null
}
