import { centsToInput, type EstimateCategory, type EstimateLineItem, type EstimateTotals } from '@/lib/estimates'

/** Editable draft row. Numeric fields stay as the user typed them until save. */
export type SheetRow = {
  key: string
  id: string | null
  category: EstimateCategory
  description: string
  quantity: string
  unit: string
  material: string
  labor: string
  other: string
  is_allowance: boolean
  notes: string
}

export const SHEET_COLUMNS = ['description', 'quantity', 'unit', 'material', 'labor', 'other', 'notes'] as const
export type SheetColumn = (typeof SHEET_COLUMNS)[number]
export type RowErrors = Partial<Record<SheetColumn, string>>

export type SheetItemPayload = {
  id: string | null
  category: EstimateCategory
  description: string
  quantity: string
  unit: string
  material_unit_cents: number
  labor_unit_cents: number
  other_unit_cents: number
  is_allowance: boolean
  notes: string | null
}

export const MAX_SHEET_ROWS = 1000
export const ESTIMATE_VALIDITY_DAYS = 30

let keySeq = 0
export function newRowKey() {
  keySeq += 1
  return `new-${Date.now().toString(36)}-${keySeq}`
}

export function rowFromItem(item: EstimateLineItem): SheetRow {
  return {
    key: item.id,
    id: item.id,
    category: item.category,
    description: item.description,
    quantity: String(Number(item.quantity)),
    unit: item.unit,
    material: centsToInput(item.material_unit_cents),
    labor: centsToInput(item.labor_unit_cents),
    other: centsToInput(item.other_unit_cents),
    is_allowance: item.is_allowance,
    notes: item.notes ?? '',
  }
}

export function blankRow(category: EstimateCategory): SheetRow {
  return {
    key: newRowKey(),
    id: null,
    category,
    description: '',
    quantity: '1',
    unit: 'ea',
    material: '',
    labor: '',
    other: '',
    is_allowance: false,
    notes: '',
  }
}

/** Parses a dollar string into integer cents without floating-point math. Empty means 0. */
export function parseCents(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, '')
  if (cleaned === '') return 0
  const match = /^(\d{1,12})(?:\.(\d{0,2}))?$/.exec(cleaned)
  if (!match) return null
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
}

/** Quantity in thousandths, matching the numeric(14,3) column. */
export function parseQuantityMilli(raw: string): bigint | null {
  const cleaned = raw.replace(/[,\s]/g, '')
  const match = /^(\d{1,10})(?:\.(\d{0,3}))?$/.exec(cleaned)
  if (!match) return null
  return BigInt(match[1]) * BigInt(1000) + BigInt((match[2] ?? '').padEnd(3, '0'))
}

function normalizedQuantity(raw: string): string {
  return raw.replace(/[,\s]/g, '').replace(/\.$/, '')
}

/** round(quantity * unit_cents), half away from zero, exactly like the generated DB columns. */
export function lineCents(qtyMilli: bigint, unitCents: number): number {
  return Number((qtyMilli * BigInt(unitCents) * BigInt(2) + BigInt(1000)) / BigInt(2000))
}

function percentMilli(value: number | string): bigint {
  const match = /^(\d+)(?:\.(\d{0,3}))?/.exec(String(value).trim())
  if (!match) return BigInt(0)
  return BigInt(match[1]) * BigInt(1000) + BigInt((match[2] ?? '').padEnd(3, '0'))
}

function applyPercent(cents: number, pct: number | string): number {
  return Number((BigInt(cents) * percentMilli(pct) * BigInt(2) + BigInt(100000)) / BigInt(200000))
}

export type RowMath = {
  unitCostCents: number
  materialCents: number
  laborCents: number
  otherCents: number
  totalCents: number
  valid: boolean
}

export function rowMath(row: SheetRow): RowMath {
  const q = parseQuantityMilli(row.quantity)
  const m = parseCents(row.material)
  const l = parseCents(row.labor)
  const o = parseCents(row.other)
  const valid = q !== null && m !== null && l !== null && o !== null
  const qty = q ?? BigInt(0)
  const materialCents = lineCents(qty, m ?? 0)
  const laborCents = lineCents(qty, l ?? 0)
  const otherCents = lineCents(qty, o ?? 0)
  return {
    unitCostCents: (m ?? 0) + (l ?? 0) + (o ?? 0),
    materialCents,
    laborCents,
    otherCents,
    totalCents: materialCents + laborCents + otherCents,
    valid,
  }
}

/** Mirrors public.estimates_before_write so the live preview matches what the server will store. */
export function computeTotals(
  rows: SheetRow[],
  settings: Pick<EstimateTotals, 'markup_percent' | 'contingency_percent' | 'land_cost_cents'>,
): EstimateTotals {
  let material = 0
  let labor = 0
  let other = 0
  let allowance = 0
  for (const row of rows) {
    const m = rowMath(row)
    if (row.is_allowance) allowance += m.totalCents
    else {
      material += m.materialCents
      labor += m.laborCents
      other += m.otherCents
    }
  }
  const direct = material + labor + other
  const markup = applyPercent(direct, settings.markup_percent)
  const contingency = applyPercent(direct + allowance + markup, settings.contingency_percent)
  const construction = direct + allowance + markup + contingency
  return {
    material_cents: material,
    labor_cents: labor,
    other_cents: other,
    allowance_cents: allowance,
    direct_cost_cents: direct,
    markup_cents: markup,
    contingency_cents: contingency,
    construction_total_cents: construction,
    total_with_land_cents: construction + (settings.land_cost_cents ?? 0),
    land_cost_cents: settings.land_cost_cents,
    markup_percent: settings.markup_percent,
    contingency_percent: settings.contingency_percent,
  }
}

export function isBlankNewRow(row: SheetRow) {
  return (
    row.id === null &&
    row.description.trim() === '' &&
    row.notes.trim() === '' &&
    [row.material, row.labor, row.other].every((v) => (parseCents(v) ?? 1) === 0)
  )
}

export function validateRow(row: SheetRow): RowErrors {
  const errors: RowErrors = {}
  const description = row.description.trim()
  if (!description) errors.description = 'Describe the item'
  else if (description.length > 300) errors.description = 'Keep under 300 characters'
  const q = parseQuantityMilli(row.quantity)
  if (q === null) errors.quantity = 'Number, up to 3 decimals'
  else if (q > BigInt('1000000000000')) errors.quantity = 'Too large'
  const unit = row.unit.trim()
  if (!unit) errors.unit = 'Required'
  else if (unit.length > 20) errors.unit = 'Max 20 characters'
  for (const col of ['material', 'labor', 'other'] as const) {
    if (parseCents(row[col]) === null) errors[col] = 'Dollar amount like 1250.00'
  }
  if (row.notes.length > 1000) errors.notes = 'Keep under 1,000 characters'
  return errors
}

export function toPayload(row: SheetRow): SheetItemPayload {
  return {
    id: row.id,
    category: row.category,
    description: row.description.trim(),
    quantity: normalizedQuantity(row.quantity),
    unit: row.unit.trim(),
    material_unit_cents: parseCents(row.material) ?? 0,
    labor_unit_cents: parseCents(row.labor) ?? 0,
    other_unit_cents: parseCents(row.other) ?? 0,
    is_allowance: row.is_allowance,
    notes: row.notes.trim() || null,
  }
}

/** Splits spreadsheet clipboard text (tab-separated, newline rows) into cells. */
export function parseClipboardGrid(text: string): string[][] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop()
  return lines.map((line) =>
    line.split('\t').map((cell) => {
      const trimmed = cell.trim()
      return trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')
        ? trimmed.slice(1, -1).replace(/""/g, '"')
        : trimmed
    }),
  )
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
