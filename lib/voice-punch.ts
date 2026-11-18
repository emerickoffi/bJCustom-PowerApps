import { z } from 'zod'
import { addDaysIso, isIsoDate, matchNamed, type NamedChoice } from './voice.ts'

export {
  ALLOWED_AUDIO_TYPES,
  RECORDING_MIME_CANDIDATES,
  VOICE_LIMITS,
  addDaysIso,
  baseMime,
  isIsoDate,
  mergeDecision,
  pickRecordingMime,
  weekdayOf,
} from './voice.ts'

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

export type AssigneeChoice = NamedChoice

export type VoiceDraft = {
  title: string
  description: string
  location: string
  assignee: { mention: string | null; matches: AssigneeChoice[] }
  dueDate: { phrase: string | null; date: string | null; needsReview: boolean }
}

/** Matches a spoken assignee against the eligible list only. Never proposes anyone outside it. */
export function matchAssignees(mention: string | null, options: AssigneeChoice[]): AssigneeChoice[] {
  return matchNamed(mention, options)
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

