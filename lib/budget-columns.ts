/** Remembers which optional Budget & costs columns this browser shows. */
export const BUDGET_COLUMNS_COOKIE = 'bj_budget_columns'

/** `tracking` columns need commitments, bills and payments to be set up. */
export const OPTIONAL_BUDGET_COLUMNS = [
  { key: 'original', label: 'Original budget', tracking: false },
  { key: 'changes', label: 'Approved budget changes', tracking: false },
  { key: 'paid', label: 'Paid to vendors', tracking: true },
  { key: 'forecast', label: 'Forecast final cost', tracking: true },
  { key: 'variance', label: 'Forecast variance', tracking: true },
] as const

export type OptionalBudgetColumn = (typeof OPTIONAL_BUDGET_COLUMNS)[number]['key']

const KEYS = OPTIONAL_BUDGET_COLUMNS.map((c) => c.key)

/** Without a saved choice, the simple default (no optional columns) applies. */
export function parseBudgetColumns(value: string | null | undefined): OptionalBudgetColumn[] {
  const saved = new Set((value ?? '').split('.'))
  return KEYS.filter((key) => saved.has(key))
}

export function serializeBudgetColumns(shown: readonly OptionalBudgetColumn[]): string {
  const keys = KEYS.filter((key) => shown.includes(key))
  return keys.length ? keys.join('.') : 'none'
}
