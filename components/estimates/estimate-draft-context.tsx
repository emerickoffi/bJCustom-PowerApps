'use client'

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { EstimateTotals } from '@/lib/estimates'
import type { WorkspaceTab } from '@/lib/estimate-workspace'

export const SETTINGS_FIELDS = ['description', 'markup_percent', 'contingency_percent', 'land_cost', 'notes'] as const
export type DraftSettings = Record<(typeof SETTINGS_FIELDS)[number], string>

/** What the line-item sheet publishes so the header, tabs and totals rail can reflect one editing state. */
export type SheetStatus = {
  dirty: boolean
  itemsDirty: boolean
  saving: boolean
  refreshing: boolean
  saveError: string | null
  itemErrors: number
  totals: EstimateTotals
}

/** clean: nothing to save · saved: saved just now · cancelled: user backed out · failed: save did not succeed */
export type EnsureSavedResult = 'clean' | 'saved' | 'cancelled' | 'failed'

type DraftContext = {
  /** Current values in the pricing settings form, or null before it has mounted. */
  settings: DraftSettings | null
  setSettings: (s: DraftSettings) => void
  /** Values the settings form showed when it last loaded server data. */
  baseline: DraftSettings | null
  setBaseline: (s: DraftSettings) => void
  fieldErrors: Record<string, string>
  setFieldErrors: (e: Record<string, string>) => void
  /** Bumped when the editor adopts fresh server data, remounting the settings form with saved values. */
  version: number
  bumpVersion: () => void
  /** True while a save is in flight or the page is refreshing after one. */
  locked: boolean
  setLocked: (v: boolean) => void
  tab: WorkspaceTab
  setTab: (t: WorkspaceTab) => void
  sheet: SheetStatus | null
  setSheet: (s: SheetStatus) => void
  /** The sheet registers its Save draft implementation here. Resolves true only after the server confirms. */
  registerSave: (fn: (() => Promise<boolean>) | null) => void
  save: () => Promise<boolean>
  /** Before a workflow step that uses the saved estimate, offers to save unsaved edits first. */
  ensureSaved: (action: string, onConfirmGesture?: () => ((ok: boolean) => void) | void) => Promise<EnsureSavedResult>
  /** Whether the below-2xl cost breakdown is expanded. Shared so the line-items toolbar can toggle it. */
  breakdownOpen: boolean
  setBreakdownOpen: (open: boolean) => void
}

const Ctx = createContext<DraftContext | null>(null)

type Pending = {
  action: string
  onConfirmGesture?: () => ((ok: boolean) => void) | void
  resolve: (r: EnsureSavedResult) => void
}

/** Lets the line-item sheet, pricing panel, header and workflow share one draft and one Save draft action. */
export function EstimateDraftProvider({ children, initialTab = 'items' }: { children: ReactNode; initialTab?: WorkspaceTab }) {
  const [settings, setSettings] = useState<DraftSettings | null>(null)
  const [baseline, setBaseline] = useState<DraftSettings | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [version, setVersion] = useState(0)
  const [locked, setLocked] = useState(false)
  const [tab, setTabState] = useState<WorkspaceTab>(initialTab)
  const [sheet, setSheet] = useState<SheetStatus | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [breakdownOpen, setBreakdownOpen] = useState(false)
  const saveRef = useRef<(() => Promise<boolean>) | null>(null)
  const dirtyRef = useRef(false)
  dirtyRef.current = Boolean(sheet?.dirty)

  const setTab = useCallback((t: WorkspaceTab) => {
    setTabState(t)
    const url = new URL(window.location.href)
    url.searchParams.set('tab', t)
    // Shallow URL update so the tab is linkable without a navigation, refresh or save.
    window.history.replaceState(window.history.state, '', url)
  }, [])

  const registerSave = useCallback((fn: (() => Promise<boolean>) | null) => {
    saveRef.current = fn
  }, [])
  const save = useCallback(() => saveRef.current?.() ?? Promise.resolve(true), [])

  const ensureSaved = useCallback<DraftContext['ensureSaved']>((action, onConfirmGesture) => {
    if (!dirtyRef.current || !saveRef.current) return Promise.resolve('clean')
    return new Promise((resolve) => setPending({ action, onConfirmGesture, resolve }))
  }, [])

  const settle = (r: EnsureSavedResult) => {
    pending?.resolve(r)
    setPending(null)
    setConfirming(false)
  }

  const confirm = async () => {
    if (!pending || confirming) return
    const after = pending.onConfirmGesture?.() ?? undefined
    setConfirming(true)
    const ok = await save()
    after?.(ok)
    settle(ok ? 'saved' : 'failed')
  }

  const value = useMemo(
    () => ({
      settings,
      setSettings,
      baseline,
      setBaseline,
      fieldErrors,
      setFieldErrors,
      version,
      bumpVersion: () => setVersion((v) => v + 1),
      locked,
      setLocked,
      tab,
      setTab,
      sheet,
      setSheet,
      registerSave,
      save,
      ensureSaved,
      breakdownOpen,
      setBreakdownOpen,
    }),
    [settings, baseline, fieldErrors, version, locked, tab, setTab, sheet, registerSave, save, ensureSaved, breakdownOpen],
  )

  return (
    <Ctx.Provider value={value}>
      {children}
      <Dialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open && !confirming) settle('cancelled')
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save changes first?</DialogTitle>
            <DialogDescription>
              {`You have unsaved estimate edits. To ${pending?.action ?? 'continue'}, save the draft first so the saved estimate includes them.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => settle('cancelled')} disabled={confirming}>
              Cancel
            </Button>
            <Button type="button" onClick={confirm} disabled={confirming}>
              {confirming ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Save data-icon="inline-start" />}
              {confirming ? 'Saving...' : 'Save and continue'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Ctx.Provider>
  )
}

export function useEstimateDraft() {
  return useContext(Ctx)
}

export function sameSettings(a: DraftSettings | null, b: DraftSettings | null) {
  if (!a || !b) return true
  return SETTINGS_FIELDS.every((k) => a[k].trim() === b[k].trim())
}
