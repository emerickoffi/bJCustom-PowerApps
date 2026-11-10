import { formatDate } from './format.ts'
import { isOverdue, todayIso, type ActivityStatus } from './schedule.ts'
import type { NextAction } from './next-actions.ts'

/** Namespaced so it never collides with the `project` filter that drives the global project selector. */
export const PREVIEW_PARAM = 'previewProject'
export const PREVIEW_PANEL_ID = 'project-preview'
export const PREVIEW_PHOTO_LIMIT = 3
export const PREVIEW_SUMMARY_MAX = 240

export type PreviewActivityRow = {
  id: string
  name: string
  status: ActivityStatus
  planned_start: string | null
  planned_end: string | null
  activity_type: string
  assigned_to: string | null
}

export type PreviewNextActivity =
  | { state: 'off' | 'error' | 'empty' | 'complete'; scheduleHref: string }
  | {
      state: 'undated'
      scheduleHref: string
      openCount: number
      /** Needs attention already shows the planning step and its schedule link, so this section only adds context. */
      actionListed: boolean
    }
  | {
      state: 'ready'
      scheduleHref: string
      href: string
      name: string
      milestone: boolean
      plannedLabel: string
      status: ActivityStatus
      overdue: boolean
      /** Null when nobody is assigned. */
      assigneeName: string | null
    }

export type PreviewPhoto = { id: string; url: string; alt: string }

export type PreviewLatestUpdate =
  /** `off`: the module is disabled or this viewer cannot read daily logs, so the section is not shown at all. */
  | { state: 'off' | 'error' | 'empty' }
  | {
      state: 'ready'
      href: string
      dateLabel: string
      draft: boolean
      /** Null when the log has no written notes yet. */
      summary: string | null
      photos: PreviewPhoto[]
      morePhotos: number
    }

export type ProjectPreview = {
  id: string
  summary: {
    /** Null when the project has no address on file. */
    address: string | null
    /** Null when no project manager is assigned. */
    managerName: string | null
    dateLabel: 'Target completion' | 'Completed'
    /** Null when the date is not recorded. */
    dateValue: string | null
  }
  attention: {
    items: NextAction[]
    hiddenCount: number
    /** A source failed to load, so an empty list must not read as "nothing to do". */
    incomplete: boolean
  }
  nextActivity: PreviewNextActivity
  latestUpdate: PreviewLatestUpdate
}

export function previewApiPath(projectId: string) {
  return `/api/projects/${encodeURIComponent(projectId)}/preview`
}

/** Same selection as the Overview schedule snapshot: the earliest dated activity that is neither complete nor skipped. */
export function pickNextActivity<T extends Pick<PreviewActivityRow, 'status' | 'planned_start' | 'planned_end'>>(
  activities: T[],
): { state: 'empty' | 'complete' | 'undated' } | { state: 'ready'; activity: T } {
  const counted = activities.filter((a) => a.status !== 'skipped')
  if (!counted.length) return { state: 'empty' }
  const open = counted.filter((a) => a.status !== 'completed')
  const dated = open
    .filter((a) => a.planned_start || a.planned_end)
    .sort((a, b) => (a.planned_start ?? a.planned_end ?? '').localeCompare(b.planned_start ?? b.planned_end ?? ''))
  if (dated[0]) return { state: 'ready', activity: dated[0] }
  return { state: open.length ? 'undated' : 'complete' }
}

/** Same rule as the Overview's pending actions: open work that is marked delayed or past its planned finish, most overdue first. */
export function lateActivities<T extends Pick<PreviewActivityRow, 'status' | 'planned_end'>>(activities: T[], today = todayIso()): T[] {
  return activities
    .filter(
      (a) =>
        a.status !== 'skipped' &&
        a.status !== 'completed' &&
        (a.status === 'delayed' || (!!a.planned_end && a.planned_end < today)),
    )
    .sort((a, b) => (a.planned_end ?? '9999-12-31').localeCompare(b.planned_end ?? '9999-12-31'))
}

export function plannedLabel(a: Pick<PreviewActivityRow, 'planned_start' | 'planned_end'>) {
  if (a.planned_start && a.planned_end && a.planned_start !== a.planned_end) {
    return `${formatDate(a.planned_start)} – ${formatDate(a.planned_end)}`
  }
  if (a.planned_end) return `Planned ${formatDate(a.planned_end)}`
  return `Starts ${formatDate(a.planned_start)}`
}

export function isPastPlannedFinish(a: Pick<PreviewActivityRow, 'status' | 'planned_end'>, today = todayIso()) {
  return isOverdue(a, today)
}

/** First written field of a daily log, flattened to one line and capped for the preview. */
export function dailyLogSummary(log: {
  work_performed: string | null
  progress_notes: string | null
  weather_conditions: string | null
}): string | null {
  const text = [log.work_performed, log.progress_notes, log.weather_conditions]
    .map((value) => (value ?? '').replace(/\s+/g, ' ').trim())
    .find(Boolean)
  if (!text) return null
  return text.length > PREVIEW_SUMMARY_MAX ? `${text.slice(0, PREVIEW_SUMMARY_MAX - 1).trimEnd()}…` : text
}

/** What the panel says for a failed request, and whether trying again can help. */
export function previewErrorState(status: number | null): { message: string; retry: boolean } {
  if (status === 401) return { message: 'Your session has ended. Sign in again to see this project.', retry: false }
  if (status === 403) return { message: 'You do not have access to this project.', retry: false }
  if (status === 404) return { message: 'This project is no longer available.', retry: false }
  return { message: 'Project details could not be loaded.', retry: true }
}
