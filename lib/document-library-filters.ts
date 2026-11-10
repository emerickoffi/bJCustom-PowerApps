export type DocumentLibraryTab = 'projects' | 'company'

const SHARED_KEYS = ['q', 'category', 'archived'] as const
const PROJECT_ONLY_KEYS = ['visibility', 'project'] as const

export type LibraryFilters = Partial<Record<(typeof SHARED_KEYS)[number] | (typeof PROJECT_ONLY_KEYS)[number], string>>

export function libraryFilterCookie(tab: DocumentLibraryTab) {
  return `bateevo_documents_${tab}_filters`
}

function allowedKeys(tab: DocumentLibraryTab): readonly string[] {
  return tab === 'company' ? SHARED_KEYS : [...SHARED_KEYS, ...PROJECT_ONLY_KEYS]
}

/** Keeps only the filter keys valid for a library; page and tab are intentionally dropped. */
export function pickLibraryFilters(tab: DocumentLibraryTab, params: Record<string, string | undefined>): LibraryFilters {
  const out: Record<string, string> = {}
  for (const key of allowedKeys(tab)) {
    const value = params[key]
    if (typeof value === 'string' && value.length > 0 && value.length <= 200) out[key] = value
  }
  return out as LibraryFilters
}

export function serializeLibraryFilters(tab: DocumentLibraryTab, params: Record<string, string | undefined>) {
  return new URLSearchParams(pickLibraryFilters(tab, params)).toString()
}

export function parseLibraryFilters(tab: DocumentLibraryTab, raw: string | undefined): LibraryFilters {
  if (!raw) return {}
  try {
    return pickLibraryFilters(tab, Object.fromEntries(new URLSearchParams(decodeURIComponent(raw))))
  } catch {
    return {}
  }
}
