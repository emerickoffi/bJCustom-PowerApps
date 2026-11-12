import { z } from 'zod'

export const VOICE_LIMITS = {
  maxSeconds: 90,
  /** Kept under the 4.5 MB serverless request body limit. */
  maxBytes: 4 * 1024 * 1024,
  minBytes: 1_000,
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

const MAX_TITLE = 160
const MAX_DESCRIPTION = 5000
const MAX_LOCATION = 120

/** What the model is allowed to return. Anything else is rejected. */
export const voiceDraftModelSchema = z.object({
  title: z.string().max(MAX_TITLE).describe('Short title of the defect, under 80 characters. Empty if no defect is described.'),
  description: z.string().max(MAX_DESCRIPTION).describe('What is wrong, in the speaker’s words. No invented details.'),
  location: z.string().max(MAX_LOCATION).describe('Room or area if stated, e.g. "Upstairs bathroom". Empty if not stated.'),
  assigneeMention: z
    .string()
    .max(120)
    .nullable()
    .describe('The person or company the speaker said to assign it to, exactly as spoken. Null if not stated.'),
  dueDate: z.object({
    phrase: z.string().max(80).nullable().describe('The due-date words as spoken, e.g. "Friday". Null if not stated.'),
    date: z.string().nullable().describe('YYYY-MM-DD resolved from the phrase and today’s date, or null if unclear.'),
    ambiguous: z.boolean().describe('True if the phrase could mean more than one date.'),
  }),
})
export type VoiceDraftModelOutput = z.infer<typeof voiceDraftModelSchema>

export type AssigneeChoice = { value: string; label: string }

export type VoiceDraft = {
  title: string
  description: string
  location: string
  assignee: { mention: string | null; matches: AssigneeChoice[] }
  dueDate: { phrase: string | null; date: string | null; needsReview: boolean }
}

const STOPWORDS = new Set(['the', 'a', 'an', 'to', 'it', 'and', 'our', 'my', 'mr', 'mrs', 'ms', 'guy', 'team', 'crew', 'company', 'contractor', 'sub', 'subcontractor'])

function tokens(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9']+/)
    .map((t) => t.replace(/'s$/, ''))
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t))
}

/** Option labels look like "Name · Company · Role"; only the name part is matched. */
function nameTokens(label: string) {
  return tokens(label.split(' · ')[0] ?? label)
}

/**
 * Matches a spoken assignee against the eligible list only. Never proposes anyone outside it.
 * When several people share the spoken words, all are returned so the user picks.
 */
export function matchAssignees(mention: string | null, options: AssigneeChoice[]): AssigneeChoice[] {
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

/** Keeps a model-proposed date only when it is valid, not in the past, and within a year of today. */
export function reviewProposedDate(output: VoiceDraftModelOutput['dueDate'], today: string): VoiceDraft['dueDate'] {
  const phrase = output.phrase?.trim() || null
  if (!phrase) return { phrase: null, date: null, needsReview: false }
  const date = output.date && isIsoDate(output.date) && output.date >= today && output.date <= addDaysIso(today, 366) ? output.date : null
  return { phrase, date: output.ambiguous ? null : date, needsReview: output.ambiguous || !date }
}

export function buildVoiceDraft(output: VoiceDraftModelOutput, today: string, options: AssigneeChoice[]): VoiceDraft {
  const mention = output.assigneeMention?.trim() || null
  return {
    title: output.title.trim().slice(0, MAX_TITLE),
    description: output.description.trim().slice(0, MAX_DESCRIPTION),
    location: output.location.trim().slice(0, MAX_LOCATION),
    assignee: { mention, matches: matchAssignees(mention, options) },
    dueDate: reviewProposedDate(output.dueDate, today),
  }
}

/** How a proposed value relates to what is already in the form. */
export function mergeDecision(current: string, proposed: string): 'skip' | 'fill' | 'conflict' {
  const p = proposed.trim()
  if (!p) return 'skip'
  const c = current.trim()
  if (!c) return 'fill'
  return c === p ? 'skip' : 'conflict'
}
