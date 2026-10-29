import { z } from 'zod'

export const CLIENT_UPDATE_SECTIONS = [
  { key: 'overview', label: 'Overview', hint: 'A short summary of where the home stands.' },
  { key: 'completed_work', label: 'Completed this period', hint: 'Work finished during these dates.' },
  { key: 'in_progress_work', label: 'In progress', hint: 'Work underway right now.' },
  { key: 'upcoming_work', label: 'Coming up next', hint: 'What the homeowner can expect next.' },
  { key: 'homeowner_message', label: 'A note from your builder', hint: 'Optional personal message.' },
] as const

export type ClientUpdateSectionKey = (typeof CLIENT_UPDATE_SECTIONS)[number]['key']
export type ClientUpdateSections = Record<ClientUpdateSectionKey, string | null>

export type ClientUpdatePhotoSource = 'daily_log_photo' | 'issue_attachment'
export type ClientUpdateSourceType = 'daily_log' | 'schedule_activity'

export type ClientUpdateRow = ClientUpdateSections & {
  id: string
  project_id: string
  title: string
  period_start: string
  period_end: string
  ai_assisted: boolean
  status: 'draft' | 'published'
  version: number
  revision: number
  published_version: number | null
  first_published_at: string | null
  last_published_at: string | null
  updated_at: string
}

export type ClientUpdateState = 'draft' | 'published' | 'pending_changes'

export function clientUpdateState(u: Pick<ClientUpdateRow, 'status' | 'version' | 'published_version'>): ClientUpdateState {
  if (u.status !== 'published') return 'draft'
  return u.published_version === u.version ? 'published' : 'pending_changes'
}

export const CLIENT_UPDATE_STATE_LABELS: Record<ClientUpdateState, string> = {
  draft: 'Draft',
  published: 'Published',
  pending_changes: 'Unpublished edits',
}

const text = (max: number) =>
  z
    .string()
    .max(max, `Keep this under ${max} characters.`)
    .transform((v) => v.trim() || null)
    .nullable()

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date.')

export const clientUpdatePhotoSchema = z.object({
  source_type: z.enum(['daily_log_photo', 'issue_attachment']),
  source_id: z.uuid(),
  caption: z.string().max(300).transform((v) => v.trim() || null).nullable(),
  is_cover: z.boolean(),
})

export const clientUpdateFormSchema = z
  .object({
    title: z.string().trim().min(1, 'Add a title.').max(160, 'Keep the title under 160 characters.'),
    period_start: isoDate,
    period_end: isoDate,
    overview: text(4000),
    completed_work: text(4000),
    in_progress_work: text(4000),
    upcoming_work: text(4000),
    homeowner_message: text(4000),
    ai_assisted: z.boolean(),
    sources: z
      .array(z.object({ source_type: z.enum(['daily_log', 'schedule_activity']), source_id: z.uuid() }))
      .max(100),
    photos: z.array(clientUpdatePhotoSchema).max(24, 'Choose up to 24 photos.'),
  })
  .refine((v) => v.period_end >= v.period_start, { path: ['period_end'], message: 'End date must be on or after the start date.' })
  .refine((v) => daysBetween(v.period_start, v.period_end) <= 62, { path: ['period_end'], message: 'Keep the period to about two months or less.' })

export type ClientUpdateForm = z.infer<typeof clientUpdateFormSchema>

export function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

export function hasPublishableContent(s: Partial<ClientUpdateSections>) {
  return Boolean(s.overview?.trim() || s.completed_work?.trim() || s.in_progress_work?.trim() || s.upcoming_work?.trim())
}

/** Maps errors raised by the client-update triggers and publish function to readable messages. */
export function clientUpdateErrorMessage(error: { message?: string; code?: string } | null | undefined): string | null {
  const m = error?.message ?? ''
  if (m.includes('stale_version')) return 'This update changed since you opened it. Reload to see the latest version before publishing.'
  if (m.includes('empty_update')) return 'Add an overview or at least one work section before publishing.'
  if (m.includes('photo_not_allowed')) return 'One of the photos is no longer available for sharing. Remove it and try again.'
  if (m.includes('source_not_allowed')) return 'One of the selected sources is no longer available. Remove it and try again.'
  if (m.includes('feature_disabled')) return 'Client updates are turned off for your company.'
  if (m.includes('not_authorized') || error?.code === '42501') return 'You do not have permission to change this update.'
  return null
}

export function formatPeriod(start: string, end: string) {
  const fmt = (d: string, withYear: boolean) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' })
  if (start === end) return fmt(start, true)
  const sameYear = start.slice(0, 4) === end.slice(0, 4)
  return `${fmt(start, !sameYear)} – ${fmt(end, true)}`
}

export function clientUpdatesPath(projectId: string) {
  return `/projects/${projectId}/client-updates`
}
