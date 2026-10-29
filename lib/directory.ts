export type DirectoryView = 'cards' | 'table'
export type DirectoryModule = 'clients' | 'projects'

export const DIRECTORY_PAGE_SIZE = 20
const MAX_PAGE = 10_000

/** Cookie remembering an explicit Cards/Table choice per module. Not a database preference. */
export const DIRECTORY_VIEW_COOKIE: Record<DirectoryModule, string> = {
  clients: 'bj_dir_view_clients',
  projects: 'bj_dir_view_projects',
}

export function parseView(value: string | null | undefined): DirectoryView | null {
  return value === 'cards' || value === 'table' ? value : null
}

export function parsePage(value: string | null | undefined): number {
  if (!value || !/^\d+$/.test(value)) return 1
  const page = Number(value)
  return page >= 1 ? Math.min(page, MAX_PAGE) : 1
}

export function pageBounds(page: number, size = DIRECTORY_PAGE_SIZE) {
  const from = (page - 1) * size
  return { from, to: from + size - 1 }
}

export function totalPages(total: number, size = DIRECTORY_PAGE_SIZE) {
  return Math.max(1, Math.ceil(total / size))
}

export type SortOrder = { column: string; ascending: boolean; nullsFirst?: boolean }
export type SortDefinition = { label: string; orders: SortOrder[] }

/** Every sort ends with `id` so ties (same name, same timestamp) page deterministically. */
export const CLIENT_SORTS = {
  name_asc: {
    label: 'Name A–Z',
    orders: [
      { column: 'last_name', ascending: true },
      { column: 'first_name', ascending: true },
      { column: 'id', ascending: true },
    ],
  },
  name_desc: {
    label: 'Name Z–A',
    orders: [
      { column: 'last_name', ascending: false },
      { column: 'first_name', ascending: false },
      { column: 'id', ascending: false },
    ],
  },
  recent: {
    label: 'Recently added',
    orders: [
      { column: 'created_at', ascending: false },
      { column: 'id', ascending: false },
    ],
  },
  status: {
    label: 'Status',
    orders: [
      { column: 'status', ascending: true },
      { column: 'last_name', ascending: true },
      { column: 'first_name', ascending: true },
      { column: 'id', ascending: true },
    ],
  },
} satisfies Record<string, SortDefinition>

export const PROJECT_SORTS = {
  updated: {
    label: 'Recently updated',
    orders: [
      { column: 'updated_at', ascending: false },
      { column: 'id', ascending: false },
    ],
  },
  name_asc: {
    label: 'Name A–Z',
    orders: [
      { column: 'name', ascending: true },
      { column: 'id', ascending: true },
    ],
  },
  name_desc: {
    label: 'Name Z–A',
    orders: [
      { column: 'name', ascending: false },
      { column: 'id', ascending: false },
    ],
  },
  status: {
    label: 'Status',
    orders: [
      { column: 'status', ascending: true },
      { column: 'name', ascending: true },
      { column: 'id', ascending: true },
    ],
  },
  target: {
    label: 'Target date',
    orders: [
      { column: 'target_completion_date', ascending: true, nullsFirst: false },
      { column: 'name', ascending: true },
      { column: 'id', ascending: true },
    ],
  },
} satisfies Record<string, SortDefinition>

export type ClientSort = keyof typeof CLIENT_SORTS
export type ProjectSort = keyof typeof PROJECT_SORTS

export function parseSort<K extends string>(value: string | null | undefined, sorts: Record<K, SortDefinition>, fallback: K): K {
  return value && Object.prototype.hasOwnProperty.call(sorts, value) ? (value as K) : fallback
}

export function sortOptions<K extends string>(sorts: Record<K, SortDefinition>) {
  return (Object.keys(sorts) as K[]).map((value) => ({ value, label: sorts[value].label }))
}

/** Builds a directory URL, dropping empty params and the redundant `page=1`. */
export function directoryHref(path: string, params: Record<string, string | number | null | undefined>) {
  const search = new URLSearchParams()
  for (const [key, raw] of Object.entries(params)) {
    if (raw === null || raw === undefined || raw === '') continue
    const value = String(raw)
    if (key === 'page' && value === '1') continue
    search.set(key, value)
  }
  const qs = search.toString()
  return qs ? `${path}?${qs}` : path
}

export function resultRange(page: number, count: number, total: number, size = DIRECTORY_PAGE_SIZE) {
  if (!total || !count) return { start: 0, end: 0 }
  const start = (page - 1) * size + 1
  return { start, end: start + count - 1 }
}
