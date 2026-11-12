'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { deleteDraft, getDraft, putDraft } from '@/lib/device-drafts'

/** Text drafts older than this are discarded instead of restored. Photos are never stored. */
const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const SKIP_FIELDS = new Set(['request_id', 'project_id', 'source_daily_log_id', 'source_walkthrough_id'])

/**
 * Keeps the typed fields of an unsent issue on this device (IndexedDB, scoped to user and organization),
 * so closing the sheet or losing signal does not lose the text. Cleared on save, on discard, and on sign-out.
 */
export function useIssueDraft({
  open,
  formRef,
  userId,
  orgId,
  projectId,
  sourceId,
}: {
  open: boolean
  formRef: React.RefObject<HTMLFormElement | null>
  userId: string
  orgId: string
  projectId: string
  sourceId: string | null
}) {
  const key = `issue-report:${projectId}:${sourceId ?? 'none'}`
  const [restoredAt, setRestoredAt] = useState<number | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    getDraft(key, userId, orgId)
      .then((draft) => {
        if (cancelled || !draft) return
        if (Date.now() - draft.savedAt > DRAFT_MAX_AGE_MS) return void deleteDraft(key).catch(() => {})
        const form = formRef.current
        if (!form) return
        for (const [name, value] of draft.entries) {
          const field = form.elements.namedItem(name)
          if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) {
            field.value = value
          }
        }
        setRestoredAt(draft.savedAt)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [open, key, userId, orgId, formRef])

  const save = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const form = formRef.current
      if (!form) return
      const entries: [string, string][] = []
      for (const [name, value] of new FormData(form).entries()) {
        if (typeof value === 'string' && !SKIP_FIELDS.has(name) && value.trim()) entries.push([name, value])
      }
      const write = entries.length
        ? putDraft({ key, userId, orgId, formType: 'issue-report', projectId, recordId: null, baseRevision: null, entries, savedAt: Date.now() })
        : deleteDraft(key)
      write.catch(() => {})
    }, 400)
  }, [formRef, key, userId, orgId, projectId])

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    setRestoredAt(null)
    deleteDraft(key).catch(() => {})
  }, [key])

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  return { restoredAt, save, clear }
}
