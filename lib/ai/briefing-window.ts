export const BRIEFING_PERIODS = ['daily', 'weekly'] as const
export type BriefingPeriod = (typeof BRIEFING_PERIODS)[number]

const FIELD_NOTE_MAX = 400

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Daily covers today and yesterday so a log filed the evening before is included. */
export function briefingWindow(period: BriefingPeriod, today: string) {
  return period === 'weekly'
    ? { from: addDaysIso(today, -6), to: today, label: 'last 7 days' }
    : { from: addDaysIso(today, -1), to: today, label: 'today and yesterday' }
}

/** Trims free-text field notes so one long entry cannot crowd out other records. */
export function clip(value: string | null | undefined, max = FIELD_NOTE_MAX): string | null {
  const text = value?.trim()
  if (!text) return null
  return text.length > max ? `${text.slice(0, max)}…` : text
}
