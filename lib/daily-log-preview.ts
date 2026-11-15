import type { DailyLogStatus } from './daily-logs.ts'

/** Distinct from every other list's selection parameter, so a selection never crosses record types. */
export const DAILY_LOG_PREVIEW_PARAM = 'previewLog'
export const DAILY_LOG_PREVIEW_PANEL_ID = 'daily-log-preview'

export function dailyLogPreviewApiPath(logId: string) {
  return `/api/daily-logs/${encodeURIComponent(logId)}/preview`
}

export type DailyLogPreviewCrew = { trade: string; company: string | null; workers: number | null }

export type DailyLogPreview = {
  id: string
  logDate: string
  status: DailyLogStatus
  project: { id: string; name: string; number: string | null }
  weather: string | null
  temperatureF: number | null
  siteConditions: string | null
  workPerformed: string | null
  progressNotes: string | null
  workPlannedNext: string | null
  crews: DailyLogPreviewCrew[]
  totalWorkers: number
  totalHours: number
  hasDelays: boolean
  delay: string | null
  safety: string | null
  photoCount: number
  finalizedAt: string | null
}

/** What the panel says for a failed request, and whether trying again can help. */
export function dailyLogPreviewErrorState(status: number | null): { message: string; retry: boolean } {
  if (status === 401) return { message: 'Your session has ended. Sign in again to see this daily log.', retry: false }
  if (status === 403) return { message: 'You do not have access to this daily log.', retry: false }
  if (status === 404) return { message: 'This daily log is no longer available.', retry: false }
  return { message: 'Daily log details could not be loaded.', retry: true }
}
