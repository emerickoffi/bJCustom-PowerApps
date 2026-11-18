import { z } from 'zod'
import { DAILY_LOG_CREW_LIMIT } from './daily-logs.ts'
import { matchNamed, type NamedChoice } from './voice.ts'

/** A daily log can be dictated in several recordings, so the joined transcript may run longer than a punch note. */
export const DAILY_LOG_TRANSCRIPT_MAX = 8000

/** Text fields voice may fill, with the same length caps as the daily_logs table. */
export const DAILY_LOG_VOICE_TEXT_FIELDS = {
  weather_conditions: 200,
  weather_impact: 2000,
  site_conditions: 2000,
  work_performed: 8000,
  progress_notes: 4000,
  work_planned_next: 4000,
  materials_delivered: 4000,
  equipment_used: 4000,
  delivery_notes: 2000,
  delay_description: 4000,
  delay_reason: 1000,
  delay_impact: 1000,
  corrective_actions: 4000,
  safety_observations: 4000,
} as const

export type DailyLogVoiceTextField = keyof typeof DAILY_LOG_VOICE_TEXT_FIELDS

const text = (what: string) => z.string().describe(`${what} Empty string if not stated.`)

/**
 * What the model is allowed to return. Lengths are not constrained here on purpose: an over-long
 * answer is trimmed afterwards instead of failing the whole draft.
 */
export const dailyLogVoiceModelSchema = z.object({
  weather_conditions: text('Weather as described, e.g. "Clear, light wind".'),
  temperature_f: z.number().nullable().describe('Temperature in whole °F only if a number was spoken. Convert °C if the speaker used Celsius. Null if not stated.'),
  weather_impact: text('How weather affected work.'),
  site_conditions: text('Site conditions such as mud, access, or cleanliness.'),
  work_performed: text('Work done today, in the speaker’s words. Several items may be separate sentences.'),
  progress_notes: text('Progress or percent-complete remarks.'),
  work_planned_next: text('Work planned for the next day or coming days.'),
  materials_delivered: text('Materials delivered today.'),
  equipment_used: text('Equipment on site or used.'),
  delivery_notes: text('Notes about deliveries, e.g. late or damaged.'),
  delay_description: text('Any delay that happened. Empty if the speaker reported no delay.'),
  delay_reason: text('Short cause of the delay, e.g. "Weather" or "Inspection".'),
  delay_impact: text('Effect of the delay, e.g. "Half day lost on framing".'),
  corrective_actions: text('Actions taken to fix problems or recover time.'),
  safety_observations: text('Safety observations or incidents mentioned.'),
  crews: z
    .array(
      z.object({
        trade: z.string().describe('Trade or crew, e.g. "Framing" or "Electrical".'),
        companyMention: z.string().nullable().describe('Company name exactly as spoken. Null if not stated.'),
        crewSize: z.number().nullable().describe('Number of workers if stated, else null.'),
        hours: z.number().nullable().describe('Hours worked if stated, else null.'),
        notes: z.string().describe('Anything else said about this crew. Empty string if nothing.'),
      }),
    )
    .describe('One entry per trade or company on site today. Empty array if none mentioned.'),
})
export type DailyLogVoiceModelOutput = z.infer<typeof dailyLogVoiceModelSchema>

export type CompanyChoice = NamedChoice & { trade: string }

export type DailyLogVoiceCrew = {
  trade: string
  crew_size: string
  hours_worked: string
  notes: string
  /** Set only when exactly one active company matches what was said. */
  subcontractor_company_id: string
  companyMention: string | null
  /** Several companies matched the spoken name; the user picks. */
  companyChoices: CompanyChoice[]
}

export type DailyLogVoiceDraft = {
  fields: Partial<Record<DailyLogVoiceTextField, string>>
  temperature_f: string
  crews: DailyLogVoiceCrew[]
}

function wholeInRange(value: number | null, min: number, max: number) {
  if (value === null || !Number.isFinite(value)) return ''
  const n = Math.round(value)
  return n >= min && n <= max ? String(n) : ''
}

function hoursInRange(value: number | null) {
  if (value === null || !Number.isFinite(value) || value < 0 || value > 5000) return ''
  return String(Math.round(value * 100) / 100)
}

/** Trims, caps and validates the model output against the daily log rules before it reaches the form. */
export function buildDailyLogVoiceDraft(output: DailyLogVoiceModelOutput, companies: CompanyChoice[]): DailyLogVoiceDraft {
  const fields: DailyLogVoiceDraft['fields'] = {}
  for (const [name, max] of Object.entries(DAILY_LOG_VOICE_TEXT_FIELDS) as [DailyLogVoiceTextField, number][]) {
    const value = (output[name] ?? '').trim().slice(0, max)
    if (value) fields[name] = value
  }
  // A reason or impact without a description would not flag the log as delayed, so it is kept with a description only.
  if (!fields.delay_description) {
    delete fields.delay_reason
    delete fields.delay_impact
  }

  const crews: DailyLogVoiceCrew[] = []
  for (const c of output.crews ?? []) {
    if (crews.length >= DAILY_LOG_CREW_LIMIT) break
    const mention = c.companyMention?.trim() || null
    const matches = matchNamed(mention, companies)
    const company = matches.length === 1 ? matches[0] : null
    const trade = (c.trade.trim() || company?.trade || mention || '').slice(0, 120)
    if (!trade) continue
    crews.push({
      trade,
      crew_size: wholeInRange(c.crewSize, 0, 500),
      hours_worked: hoursInRange(c.hours),
      notes: (c.notes ?? '').trim().slice(0, 1000),
      subcontractor_company_id: company?.value ?? '',
      companyMention: mention,
      companyChoices: matches.length > 1 ? matches : [],
    })
  }

  return { fields, temperature_f: wholeInRange(output.temperature_f, -60, 140), crews }
}

/** True when the draft has nothing to put in the form. */
export function isEmptyDailyLogDraft(draft: DailyLogVoiceDraft) {
  return Object.keys(draft.fields).length === 0 && !draft.temperature_f && draft.crews.length === 0
}
