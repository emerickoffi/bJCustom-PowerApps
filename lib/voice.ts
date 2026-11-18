/**
 * Shared pieces for every voice-drafting feature (punch items, daily logs): recording limits, audio
 * formats, name matching against an allowed list, date helpers, and the fill-or-ask merge rule.
 */

export const VOICE_LIMITS = {
  maxSeconds: 90,
  /** Kept under the 4.5 MB serverless request body limit. */
  maxBytes: 4 * 1024 * 1024,
  minBytes: 1_000,
  /** Per recording. Several recordings can be joined into one transcript up to the feature's own cap. */
  transcriptMax: 4000,
  transcribePerUserPerHour: 20,
  transcribePerOrgPerDay: 400,
  extractPerUserPerHour: 30,
  extractPerOrgPerDay: 600,
  transcribeTimeoutMs: 40_000,
  extractTimeoutMs: 25_000,
} as const

/** Tried in order; the first the browser supports is used (Chrome/Android: webm, Safari/iOS: mp4). */
export const RECORDING_MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/ogg'] as const

export const ALLOWED_AUDIO_TYPES = new Set(['audio/webm', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/ogg', 'audio/mpeg', 'audio/wav', 'audio/x-wav'])

export function baseMime(type: string) {
  return type.split(';')[0].trim().toLowerCase()
}

export function pickRecordingMime(isSupported: (type: string) => boolean): string | null {
  for (const type of RECORDING_MIME_CANDIDATES) if (isSupported(type)) return type
  return null
}

export type NamedChoice = { value: string; label: string }

const STOPWORDS = new Set(['the', 'a', 'an', 'to', 'it', 'and', 'our', 'my', 'mr', 'mrs', 'ms', 'guy', 'team', 'crew', 'company', 'contractor', 'sub', 'subcontractor'])

function tokens(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9']+/)
    .map((t) => t.replace(/'s$/, ''))
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t))
}

/** Option labels look like "Name · Company · Role"; only the first part is matched. */
function nameTokens(label: string) {
  return tokens(label.split(' · ')[0] ?? label)
}

/**
 * Matches a spoken name against the given list only. Never proposes anything outside it.
 * When several options share the spoken words, all are returned so the user picks.
 */
export function matchNamed<T extends NamedChoice>(mention: string | null, options: T[]): T[] {
  if (!mention) return []
  const spoken = tokens(mention)
  if (!spoken.length) return []
  const scored = options
    .map((o) => {
      const names = new Set(nameTokens(o.label))
      const hits = spoken.filter((t) => names.has(t)).length
      return { o, hits, all: hits === spoken.length }
    })
    .filter((s) => s.hits > 0)
  const full = scored.filter((s) => s.all)
  return (full.length ? full : scored).map((s) => s.o)
}

export function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

export function addDaysIso(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function weekdayOf(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
}

/** How a proposed value relates to what is already in the form. */
export function mergeDecision(current: string, proposed: string): 'skip' | 'fill' | 'conflict' {
  const p = proposed.trim()
  if (!p) return 'skip'
  const c = current.trim()
  if (!c) return 'fill'
  return c === p ? 'skip' : 'conflict'
}
