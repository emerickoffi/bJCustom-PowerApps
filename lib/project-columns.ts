/** Remembers which optional Projects table columns this browser shows, alongside the saved card/table view. */
export const PROJECT_COLUMNS_COOKIE = 'bj_projects_columns'

/** Columns a viewer can add to the Projects table. Every other column is always shown. */
export const OPTIONAL_PROJECT_COLUMNS = [
  { key: 'progress', label: 'Progress' },
  { key: 'manager', label: 'Project manager' },
] as const

export type OptionalProjectColumn = (typeof OPTIONAL_PROJECT_COLUMNS)[number]['key']

const KEYS = OPTIONAL_PROJECT_COLUMNS.map((column) => column.key)
const NONE = 'none'

/** The optional columns to show. Without a saved choice, or with an unreadable one, none are shown. */
export function parseProjectColumns(value: string | null | undefined): OptionalProjectColumn[] {
  const saved = new Set((value ?? '').split('.'))
  return KEYS.filter((key) => saved.has(key))
}

export function serializeProjectColumns(shown: readonly OptionalProjectColumn[]): string {
  const keys = KEYS.filter((key) => shown.includes(key))
  return keys.length ? keys.join('.') : NONE
}
