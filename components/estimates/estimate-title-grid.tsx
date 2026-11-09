'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Check, Lock, PencilLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { updateEstimateTitleAction } from '@/app/actions/estimate-title'
import { cn } from '@/lib/utils'

const DISCARD_PROMPT = 'You have an unsaved estimate title. Discard it?'

type Saved = { name: string; updatedAt: string }

type GridContext = {
  organizationId: string
  editMode: boolean
  activeKey: string | null
  savedKey: string | null
  saved: Record<string, Saved>
  requestOpen: (key: string) => boolean
  close: (key: string) => void
  setDirty: (key: string, dirty: boolean) => void
  setBusy: (busy: boolean) => void
  markSaved: (key: string, id: string, value: Saved) => void
  toggleEditMode: () => void
}

const Ctx = createContext<GridContext | null>(null)

function useGrid() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('EstimateTitleCell must be inside EstimateTitleGridProvider')
  return ctx
}

export function EstimateTitleGridProvider({
  organizationId,
  editableCount,
  children,
}: {
  organizationId: string
  editableCount: number
  children: ReactNode
}) {
  const [editMode, setEditMode] = useState(false)
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [savedKey, setSavedKey] = useState<string | null>(null)
  const [saved, setSaved] = useState<Record<string, Saved>>({})
  const dirtyRef = useRef(false)
  const busyRef = useRef(false)
  const [dirty, setDirtyState] = useState(false)

  const confirmDiscard = useCallback(() => {
    if (busyRef.current) return false
    if (!dirtyRef.current) return true
    return window.confirm(DISCARD_PROMPT)
  }, [])

  const requestOpen = useCallback(
    (key: string) => {
      if (activeKey === key) return true
      if (activeKey && !confirmDiscard()) return false
      dirtyRef.current = false
      setDirtyState(false)
      setSavedKey(null)
      setActiveKey(key)
      return true
    },
    [activeKey, confirmDiscard],
  )

  const close = useCallback((key: string) => {
    setActiveKey((k) => (k === key ? null : k))
    dirtyRef.current = false
    setDirtyState(false)
  }, [])

  const setDirty = useCallback((_key: string, value: boolean) => {
    dirtyRef.current = value
    setDirtyState(value)
  }, [])

  const setBusy = useCallback((value: boolean) => {
    busyRef.current = value
  }, [])

  const markSaved = useCallback((key: string, id: string, value: Saved) => {
    setSaved((s) => ({ ...s, [id]: value }))
    setSavedKey(key)
    setActiveKey((k) => (k === key ? null : k))
    dirtyRef.current = false
    setDirtyState(false)
  }, [])

  const toggleEditMode = useCallback(() => {
    if (editMode && activeKey && !confirmDiscard()) return
    dirtyRef.current = false
    setDirtyState(false)
    setActiveKey(null)
    setSavedKey(null)
    setEditMode((m) => !m)
  }, [editMode, activeKey, confirmDiscard])

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    const guardLinks = (e: MouseEvent) => {
      const link = (e.target as HTMLElement | null)?.closest('a[href]')
      if (!link || link.getAttribute('target') === '_blank' || e.defaultPrevented) return
      if (!window.confirm(DISCARD_PROMPT)) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    const guardForms = (e: SubmitEvent) => {
      if ((e.target as HTMLElement | null)?.closest('[data-title-editor]')) return
      if (!window.confirm(DISCARD_PROMPT)) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    window.addEventListener('beforeunload', warn)
    document.addEventListener('click', guardLinks, true)
    document.addEventListener('submit', guardForms, true)
    return () => {
      window.removeEventListener('beforeunload', warn)
      document.removeEventListener('click', guardLinks, true)
      document.removeEventListener('submit', guardForms, true)
    }
  }, [dirty])

  const value = useMemo<GridContext>(
    () => ({
      organizationId,
      editMode,
      activeKey,
      savedKey,
      saved,
      requestOpen,
      close,
      setDirty,
      setBusy,
      markSaved,
      toggleEditMode,
    }),
    [organizationId, editMode, activeKey, savedKey, saved, requestOpen, close, setDirty, setBusy, markSaved, toggleEditMode],
  )

  return (
    <Ctx.Provider value={value}>
      <EditableCountCtx.Provider value={editableCount}>{children}</EditableCountCtx.Provider>
    </Ctx.Provider>
  )
}

const EditableCountCtx = createContext(0)

/** Toolbar toggle; renders nothing when no visible row is eligible for title editing. */
export function EstimateTitleEditToggle() {
  const { editMode, toggleEditMode } = useGrid()
  const editableCount = useContext(EditableCountCtx)
  if (editableCount === 0 && !editMode) return null
  return (
    <Button
      type="button"
      variant={editMode ? 'view' : 'edit'}
      aria-pressed={editMode}
      onClick={toggleEditMode}
      className="h-11 md:h-9"
    >
      {editMode ? <Check data-icon="inline-start" /> : <PencilLine data-icon="inline-start" />}
      {editMode ? 'Done editing' : 'Edit titles'}
    </Button>
  )
}

export function EstimateTitleEditHint() {
  const { editMode } = useGrid()
  return (
    <p className="text-xs text-muted-foreground empty:hidden" aria-live="polite">
      {editMode ? 'Select a draft title to rename it. Totals and line items stay in the estimate editor.' : ''}
    </p>
  )
}

type Feedback =
  | { kind: 'error'; message: string }
  | { kind: 'conflict'; message: string; current: Saved }
  | { kind: 'locked'; message: string }
  | { kind: 'workspace'; message: string }

export function EstimateTitleCell({
  layout,
  estimateId,
  estimateNumber,
  name: serverName,
  updatedAt: serverUpdatedAt,
  editable,
  lockedReason,
  meta,
  linkClassName,
}: {
  layout: 'table' | 'card'
  estimateId: string
  estimateNumber: string
  name: string
  updatedAt: string
  editable: boolean
  lockedReason?: string
  meta: ReactNode
  linkClassName: string
}) {
  const grid = useGrid()
  const router = useRouter()
  const key = `${layout}:${estimateId}`
  const inputId = useId()
  const statusId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const savingRef = useRef(false)

  const override = grid.saved[estimateId]
  const current: Saved =
    override && override.updatedAt >= serverUpdatedAt ? override : { name: serverName, updatedAt: serverUpdatedAt }

  const [draft, setDraft] = useState(current.name)
  const [expected, setExpected] = useState(current.updatedAt)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [locked, setLocked] = useState(false)

  const open = grid.activeKey === key
  const touch = layout === 'card'

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const startEditing = () => {
    if (!grid.requestOpen(key)) return
    setDraft(current.name)
    setExpected(current.updatedAt)
    setFeedback(null)
    setLocked(false)
  }

  const finish = () => {
    grid.close(key)
    setFeedback(null)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }

  const onChange = (value: string) => {
    setDraft(value)
    grid.setDirty(key, value.trim() !== current.name)
    if (feedback?.kind === 'error') setFeedback(null)
  }

  const save = async (expectedOverride?: string) => {
    if (savingRef.current || locked) return
    savingRef.current = true
    grid.setBusy(true)
    setSaving(true)
    setFeedback(null)
    try {
      const result = await updateEstimateTitleAction({
        estimateId,
        organizationId: grid.organizationId,
        expectedUpdatedAt: expectedOverride ?? expected,
        name: draft,
      })
      if (result.ok) {
        grid.markSaved(key, estimateId, { name: result.name, updatedAt: result.updatedAt })
        requestAnimationFrame(() => triggerRef.current?.focus())
        if (!result.unchanged) router.refresh()
        return
      }
      if (result.code === 'conflict' && result.current) {
        setFeedback({ kind: 'conflict', message: result.message, current: result.current })
      } else if (result.code === 'locked' || result.code === 'not_found' || result.code === 'forbidden') {
        setLocked(true)
        setFeedback({ kind: 'locked', message: result.message })
        router.refresh()
      } else if (result.code === 'workspace') {
        setLocked(true)
        setFeedback({ kind: 'workspace', message: result.message })
      } else {
        setFeedback({ kind: 'error', message: result.message })
      }
    } catch {
      setFeedback({ kind: 'error', message: 'Could not reach the server. Your title is kept; try Save again.' })
    } finally {
      savingRef.current = false
      grid.setBusy(false)
      setSaving(false)
    }
  }

  const applyLatest = (latest: Saved) => {
    grid.markSaved(key, estimateId, latest)
    setFeedback(null)
    router.refresh()
    requestAnimationFrame(() => triggerRef.current?.focus())
  }

  const numberNode = grid.editMode ? (
    <Link
      href={`/estimates/${estimateId}`}
      className="whitespace-nowrap rounded-sm font-mono text-xs text-[#006B78] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#006B78]"
    >
      {estimateNumber}
      <span className="sr-only"> — open estimate</span>
    </Link>
  ) : null

  if (!grid.editMode || (!editable && !open)) {
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <Link href={`/estimates/${estimateId}`} title={current.name} className={linkClassName}>
          {current.name}
        </Link>
        {meta}
        {grid.editMode && lockedReason && (
          <p className="flex items-start gap-1 text-xs text-[#526173]">
            <Lock className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
            <span>{lockedReason}</span>
          </p>
        )}
      </div>
    )
  }

  if (!open) {
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <button
          ref={triggerRef}
          type="button"
          onClick={startEditing}
          aria-label={`Edit title of ${estimateNumber}: ${current.name}`}
          className={cn(
            'group flex w-full min-w-0 items-start justify-between gap-2 rounded-md border border-dashed border-[#9CCFD4] bg-[#F3FAFA] px-2 text-left font-medium text-[#17212B] transition-colors hover:border-[#006B78] hover:bg-[#E6F3F4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#006B78]',
            touch ? 'min-h-11 py-2.5' : 'min-h-9 py-1.5',
          )}
        >
          <span className="line-clamp-2 min-w-0 break-words">{current.name}</span>
          <PencilLine className="mt-0.5 size-4 shrink-0 text-[#006B78]" aria-hidden="true" />
        </button>
        <div className="flex flex-wrap items-center gap-1.5">
          {numberNode}
          {grid.savedKey === key && (
            <span role="status" className="inline-flex items-center gap-1 text-xs font-medium text-[#187542]">
              <Check className="size-3" aria-hidden="true" />
              Saved
            </span>
          )}
        </div>
        {meta}
      </div>
    )
  }

  const describedBy = feedback ? statusId : undefined

  return (
    <form
      data-title-editor
      noValidate
      className="flex min-w-0 flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <label htmlFor={inputId} className="sr-only">
        {`Title for ${estimateNumber}`}
      </label>
      <Input
        ref={inputRef}
        id={inputId}
        value={draft}
        maxLength={160}
        disabled={saving}
        readOnly={locked}
        aria-invalid={feedback?.kind === 'error' ? true : undefined}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.nativeEvent.isComposing || e.keyCode === 229)) e.preventDefault()
          if (e.key === 'Escape') {
            e.preventDefault()
            if (!saving) finish()
          }
        }}
        className={cn('bg-white', touch ? 'h-11 text-base' : 'h-9')}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          variant="action"
          size="sm"
          disabled={saving || locked}
          aria-label={`Save title for ${estimateNumber}`}
          className={touch ? 'h-11 flex-1' : 'h-9'}
        >
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={saving}
          onClick={finish}
          aria-label={`Cancel editing title for ${estimateNumber}`}
          className={touch ? 'h-11 flex-1' : 'h-9'}
        >
          {locked ? 'Close' : 'Cancel'}
        </Button>
        {numberNode}
      </div>
      <div id={statusId} aria-live="polite" className="text-xs">
        {saving && <span className="text-[#526173]">Saving…</span>}
        {feedback && feedback.kind !== 'conflict' && (
          <p className={feedback.kind === 'error' ? 'text-destructive' : 'text-[#96570E]'} role="alert">
            {feedback.message}
            {feedback.kind === 'workspace' && (
              <>
                {' '}
                <button type="button" className="font-medium underline" onClick={() => window.location.reload()}>
                  Reload page
                </button>
              </>
            )}
          </p>
        )}
        {feedback?.kind === 'conflict' && (
          <div role="alert" className="flex flex-col gap-2 rounded-md border border-[#F0D9A8] bg-[#FFF8EA] p-2 text-[#5C3A08]">
            <p>
              {`${feedback.message} Latest saved title: `}
              <strong className="break-words font-semibold">{feedback.current.name}</strong>
              {'. Your text is kept above.'}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" className={touch ? 'h-11' : 'h-8'} onClick={() => applyLatest(feedback.current)}>
                Use latest
              </Button>
              <Button
                type="button"
                variant="edit"
                size="sm"
                className={touch ? 'h-11' : 'h-8'}
                onClick={() => {
                  setExpected(feedback.current.updatedAt)
                  void save(feedback.current.updatedAt)
                }}
              >
                Save mine over it
              </Button>
            </div>
          </div>
        )}
      </div>
    </form>
  )
}
