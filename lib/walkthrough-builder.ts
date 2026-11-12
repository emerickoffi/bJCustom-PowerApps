import { assignItemNumbers } from './punch-list.ts'

export type BuilderItem = { key: string; label: string; number: string; location: string }
export type BuilderSection = { key: string; category: string; items: BuilderItem[] }

/** Title offered when the type changes, as long as the manager has not typed their own. */
export const WALKTHROUGH_TITLE_SUGGESTIONS: Record<string, string> = {
  orientation: 'Pre-drywall orientation walkthrough',
  final: 'Final homeowner walkthrough',
  warranty_30: '30-day warranty walkthrough',
  warranty_11: '11-month warranty walkthrough',
}

export function suggestTitle(type: string, current: string, edited: boolean): string {
  if (edited) return current
  return WALKTHROUGH_TITLE_SUGGESTIONS[type] ?? current
}

const plural = (n: number, noun: string) => `${n} ${n === 1 ? noun : `${noun}s`}`

export function itemCountLabel(n: number) {
  return plural(n, 'item')
}

export function checklistSummary(sections: BuilderSection[]): string {
  const items = sections.reduce((sum, s) => sum + s.items.length, 0)
  return `${plural(items, 'item')} across ${plural(sections.length, 'section')}`
}

/** Mirrors the server payload: blank labels are dropped and blank numbers are auto-assigned there. */
export function buildChecklistPayload(sections: BuilderSection[]) {
  return sections.flatMap((s) =>
    s.items
      .filter((i) => i.label.trim())
      .map((i) => ({
        category: s.category.trim(),
        label: i.label.trim(),
        item_number: i.number.trim() || undefined,
        location: i.location.trim() || undefined,
      })),
  )
}

/** Display numbers for every item, keeping custom numbers and filling the rest with the standard sequence. */
export function previewItemNumbers(sections: BuilderSection[]): Map<string, string> {
  const items = sections.flatMap((s) => s.items.filter((i) => i.label.trim()))
  const numbers = assignItemNumbers(items.map((i) => i.number))
  return new Map(items.map((i, idx) => [i.key, numbers[idx]]))
}

export type ChecklistProblem =
  | { kind: 'section'; sectionKey: string; message: string }
  | { kind: 'item'; sectionKey: string; itemKey: string; message: string }
  | { kind: 'empty'; message: string }

/** First client-side problem in checklist order, so the builder can open that section and focus the field. */
export function findChecklistProblem(sections: BuilderSection[]): ChecklistProblem | null {
  for (const s of sections) {
    if (s.items.length && !s.category.trim()) return { kind: 'section', sectionKey: s.key, message: 'Name this section' }
    const blank = s.items.find((i) => !i.label.trim())
    if (blank) return { kind: 'item', sectionKey: s.key, itemKey: blank.key, message: 'Describe this item or remove it' }
  }
  if (!sections.some((s) => s.items.length)) return { kind: 'empty', message: 'Add at least one checklist item' }
  return null
}
