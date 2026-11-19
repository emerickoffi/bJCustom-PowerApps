/**
 * Field outbox rules shared by the device queue, the sync loop and the UI. Work saved on a phone with no signal
 * waits here and is sent, in order, once the connection returns. Every item keeps the save request id it was
 * created with, so a resend after a lost response can never create a duplicate record.
 */

export type OutboxKind = 'daily_log'

export type OutboxStatus =
  /** Waiting for a connection (or for its next retry). */
  | 'waiting'
  | 'sending'
  /** The record saved but some photos still need to upload. */
  | 'photos_pending'
  /** The server rejected the entry (for example a log already exists for that date). Someone must open it. */
  | 'needs_attention'
  /** The session ended; sending resumes after signing in again. */
  | 'signed_out'

export type OutboxPhoto = { id: string; blob: Blob; fileName: string; mimeType: string; caption: string }

export type OutboxItem = {
  /** The save request id. Also the item's key. */
  id: string
  userId: string
  orgId: string
  kind: OutboxKind
  formType: string
  projectId: string
  recordId: string | null
  label: string
  entries: [string, string][]
  photos: OutboxPhoto[]
  status: OutboxStatus
  attempts: number
  lastError: string | null
  /** Set once the record exists on the server, so photo retries never resave the entry. */
  savedRecordId: string | null
  createdAt: number
  nextAttemptAt: number
}

const MINUTE = 60_000

/** 15 s, 30 s, 1 min, 2 min … capped at 15 minutes. Coming back online always retries right away. */
export function nextRetryDelay(attempts: number): number {
  return Math.min(15 * MINUTE, 15_000 * 2 ** Math.max(0, attempts - 1))
}

export function isDue(item: Pick<OutboxItem, 'status' | 'nextAttemptAt'>, now: number, force = false): boolean {
  if (item.status === 'needs_attention' || item.status === 'sending') return false
  return force || item.nextAttemptAt <= now
}

/** Oldest first, so a crew's logs reach the office in the order they were written. */
export function sendOrder<T extends Pick<OutboxItem, 'createdAt' | 'id'>>(items: T[]): T[] {
  return [...items].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
}

/** The saved daily log's id from the page the server sends the user to, e.g. /projects/{p}/daily-logs/{id}?saved=1. */
export function dailyLogIdFromHref(href: string | null | undefined): string | null {
  const m = /\/daily-logs\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#]|$)/i.exec(href ?? '')
  return m ? m[1].toLowerCase() : null
}

export function dailyLogLabel(entries: [string, string][]): string {
  const date = entries.find(([k]) => k === 'log_date')?.[1]
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Daily log'
  const [y, m, d] = date.split('-').map(Number)
  const shown = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  return `Daily log · ${shown}`
}

export function statusText(item: Pick<OutboxItem, 'status' | 'photos' | 'lastError'>): string {
  switch (item.status) {
    case 'sending':
      return 'Uploading…'
    case 'photos_pending':
      return `Saved. ${item.photos.length} photo${item.photos.length === 1 ? '' : 's'} still uploading`
    case 'needs_attention':
      return item.lastError ?? 'Needs your attention'
    case 'signed_out':
      return 'Sign in again to send'
    default:
      return item.photos.length ? `Waiting to upload · ${item.photos.length} photo${item.photos.length === 1 ? '' : 's'}` : 'Waiting to upload'
  }
}

export function waitingSummary(items: Pick<OutboxItem, 'status'>[]): { count: number; attention: number } {
  return {
    count: items.length,
    attention: items.filter((i) => i.status === 'needs_attention' || i.status === 'signed_out').length,
  }
}
