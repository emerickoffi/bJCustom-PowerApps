'use client'

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

export const SETTINGS_FIELDS = ['description', 'markup_percent', 'contingency_percent', 'land_cost', 'notes'] as const
export type DraftSettings = Record<(typeof SETTINGS_FIELDS)[number], string>

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
}

const Ctx = createContext<DraftContext | null>(null)

/** Lets the line-item sheet and the pricing settings panel share one draft and one Save draft action. */
export function EstimateDraftProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<DraftSettings | null>(null)
  const [baseline, setBaseline] = useState<DraftSettings | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [version, setVersion] = useState(0)
  const [locked, setLocked] = useState(false)
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
    }),
    [settings, baseline, fieldErrors, version, locked],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useEstimateDraft() {
  return useContext(Ctx)
}

export function sameSettings(a: DraftSettings | null, b: DraftSettings | null) {
  if (!a || !b) return true
  return SETTINGS_FIELDS.every((k) => a[k].trim() === b[k].trim())
}
