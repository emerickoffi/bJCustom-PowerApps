'use client'

import { createContext, useContext, useEffect, useState } from 'react'

export type AssistantProject = {
  id: string
  name: string
  number: string | null
  statusLabel: string
}

type AssistantContextValue = {
  project: AssistantProject | null
  setProject: (project: AssistantProject | null) => void
}

const AssistantContext = createContext<AssistantContextValue | null>(null)

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const [project, setProject] = useState<AssistantProject | null>(null)
  return <AssistantContext.Provider value={{ project, setProject }}>{children}</AssistantContext.Provider>
}

export function useAssistantProject() {
  return useContext(AssistantContext)?.project ?? null
}

/**
 * Rendered by a project page after the project has been loaded through the
 * user's own authorized query, so the assistant only ever shows context the
 * page itself was allowed to show. Clears on unmount.
 */
export function AssistantProjectScope({ project }: { project: AssistantProject }) {
  const ctx = useContext(AssistantContext)
  const setProject = ctx?.setProject
  const { id, name, number, statusLabel } = project

  useEffect(() => {
    if (!setProject) return
    setProject({ id, name, number, statusLabel })
    return () => setProject(null)
  }, [setProject, id, name, number, statusLabel])

  return null
}
