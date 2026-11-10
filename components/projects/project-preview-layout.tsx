'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useSearchParams } from 'next/navigation'
import { PREVIEW_PARAM } from '@/lib/project-preview'
import { ProjectPreviewContext, findPreviewTrigger } from '@/components/projects/project-preview-trigger'
import {
  ProjectPreviewDrawer,
  ProjectPreviewPanel,
  type PreviewLeaveGuard,
  type PreviewListProject,
} from '@/components/projects/project-preview-panel'

const WIDE_QUERY = '(min-width: 1280px)'

function subscribeWide(onChange: () => void) {
  const media = window.matchMedia(WIDE_QUERY)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

/** Null until the viewport is known (server render and hydration), where CSS alone decides whether the column shows. */
function useIsWide(): boolean | null {
  return useSyncExternalStore<boolean | null>(
    subscribeWide,
    () => window.matchMedia(WIDE_QUERY).matches,
    () => null,
  )
}

/**
 * Replaces the current history entry, so browsing previews never adds Back steps and a refresh restores the selection.
 * A null state hands the URL to the Next.js router, which keeps useSearchParams in step without a server round trip.
 */
function writePreviewParam(projectId: string | null) {
  const url = new URL(window.location.href)
  if (projectId) url.searchParams.set(PREVIEW_PARAM, projectId)
  else url.searchParams.delete(PREVIEW_PARAM)
  window.history.replaceState(null, '', url)
}

function findPreviewItem(projectId: string) {
  return findPreviewTrigger(projectId)?.closest<HTMLElement>('[data-preview-item]') ?? null
}

/**
 * The project list with its on-demand preview. With nothing selected the list has the full width and no preview is
 * rendered. A selection opens one preview: an in-layout column at desktop width, a modal drawer below it.
 */
export function ProjectPreviewLayout({ projects, children }: { projects: PreviewListProject[]; children: React.ReactNode }) {
  const urlId = useSearchParams().get(PREVIEW_PARAM)
  // A click applies immediately; the URL takes over again as soon as it reflects any change.
  const [pending, setPending] = useState<{ id: string | null; from: string | null } | null>(null)
  const [seenUrlId, setSeenUrlId] = useState(urlId)
  if (seenUrlId !== urlId) {
    setSeenUrlId(urlId)
    setPending(null)
  }
  const requestedId = pending && pending.from === urlId ? pending.id : urlId
  // Only a project on the displayed page can be previewed, so unknown or malformed IDs never reach the server.
  const selected = requestedId ? (projects.find((p) => p.id === requestedId) ?? null) : null
  const selectedId = selected?.id ?? null
  const isWide = useIsWide()
  const inlineOpen = Boolean(selected) && isWide === true

  useEffect(() => {
    if (urlId && !projects.some((p) => p.id === urlId)) writePreviewParam(null)
  }, [urlId, projects])

  const lastSelectedId = useRef<string | null>(null)
  useEffect(() => {
    if (selectedId) lastSelectedId.current = selectedId
  }, [selectedId])

  // Opening or closing the column can reflow the list (fewer or more cards per row). The project that was acted on
  // is held at the same spot on screen across that reflow, before paint, so the page never appears to jump.
  const anchor = useRef<{ id: string; top: number } | null>(null)
  const holdInPlace = useCallback((projectId: string) => {
    const rect = findPreviewItem(projectId)?.getBoundingClientRect()
    anchor.current = rect && rect.bottom > 0 && rect.top < window.innerHeight ? { id: projectId, top: rect.top } : null
  }, [])
  useLayoutEffect(() => {
    const held = anchor.current
    anchor.current = null
    const item = held ? findPreviewItem(held.id) : null
    if (!held || !item) return
    const shift = item.getBoundingClientRect().top - held.top
    if (Math.abs(shift) >= 1) window.scrollBy({ top: shift, behavior: 'instant' })
  }, [inlineOpen, selectedId])

  // A view inside the preview can hold unsaved entries. Closing the preview or choosing another project asks that
  // view first, and happens only once it has nothing to lose or the entries are discarded.
  const leaveGuard = useRef<PreviewLeaveGuard | null>(null)
  const whenClear = useCallback((proceed: () => void) => {
    const guard = leaveGuard.current
    if (!guard || guard(proceed)) proceed()
  }, [])

  const select = useCallback(
    (projectId: string) => {
      if (projectId === selectedId) return
      whenClear(() => {
        holdInPlace(projectId)
        setPending({ id: projectId, from: urlId })
        writePreviewParam(projectId)
      })
    },
    [holdInPlace, selectedId, urlId, whenClear],
  )
  const close = useCallback(() => {
    whenClear(() => {
      setPending({ id: null, from: urlId })
      writePreviewParam(null)
    })
  }, [urlId, whenClear])
  const closeInline = useCallback(() => {
    whenClear(() => {
      const trigger = selectedId ? findPreviewTrigger(selectedId) : null
      if (selectedId) holdInPlace(selectedId)
      setPending({ id: null, from: urlId })
      writePreviewParam(null)
      trigger?.focus({ preventScroll: true })
    })
  }, [holdInPlace, selectedId, urlId, whenClear])

  const context = useMemo(() => ({ selectedId, select }), [selectedId, select])

  return (
    <ProjectPreviewContext.Provider value={context}>
      <div data-preview-open={selected ? '' : undefined} className="group/preview flex min-w-0 items-start gap-5">
        <div className="@container min-w-0 flex-1">{children}</div>
        {selected && isWide !== false && (
          <ProjectPreviewPanel
            project={selected}
            onClose={closeInline}
            guardRef={leaveGuard}
            className={isWide === null ? 'hidden xl:flex' : 'flex'}
          />
        )}
      </div>
      {isWide === false && (
        <ProjectPreviewDrawer
          project={selected}
          onClose={close}
          guardRef={leaveGuard}
          finalFocus={() => (lastSelectedId.current ? findPreviewTrigger(lastSelectedId.current) : null) ?? true}
        />
      )}
    </ProjectPreviewContext.Provider>
  )
}
