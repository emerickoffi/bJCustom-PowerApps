'use client'

import { createContext, useContext } from 'react'

export type DraftIdentity = { userId: string; orgId: string }

const DraftScopeContext = createContext<DraftIdentity | null>(null)

/** Supplies the signed-in user and workspace so device drafts are always keyed to the right account. */
export function DraftScopeProvider({ userId, orgId, children }: DraftIdentity & { children: React.ReactNode }) {
  return <DraftScopeContext.Provider value={{ userId, orgId }}>{children}</DraftScopeContext.Provider>
}

export const useDraftIdentity = () => useContext(DraftScopeContext)
