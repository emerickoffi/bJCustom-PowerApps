import 'server-only'
import { cookies } from 'next/headers'
import { parseLayoutPreference, type LayoutPreference } from '@/lib/ui-layout'
import type { WeatherChoice } from '@/lib/weather'

/**
 * Per-user dashboard preferences kept in cookies. Each value is bound to the user id so a shared browser never
 * carries one person's choice into another's session; any saved project id is re-validated under RLS before use.
 */
export const WEATHER_LOCATION_COOKIE = 'dash_weather_location'
export const WORK_SCOPE_COOKIE = 'dash_work_scope'
export const LAYOUT_COOKIE = 'ui_layout'

export type WorkScope = 'all' | 'mine'

const read = async (name: string, userId: string) => {
  const raw = (await cookies()).get(name)?.value
  if (!raw) return null
  const sep = raw.indexOf('|')
  return sep > 0 && raw.slice(0, sep) === userId ? raw.slice(sep + 1) : null
}

/**
 * Stored as `<orgId>:device` or `<orgId>:project:<projectId>`. A bare project id from before organization scoping
 * is still honored; the caller re-checks it against the current organization's authorized active projects.
 */
export async function readWeatherChoice(userId: string, organizationId: string): Promise<WeatherChoice | null> {
  const raw = await read(WEATHER_LOCATION_COOKIE, userId)
  if (!raw) return null
  if (!raw.includes(':')) return { mode: 'project', projectId: raw }
  const [org, mode, projectId] = raw.split(':')
  if (org !== organizationId) return null
  if (mode === 'device') return { mode: 'device' }
  if (mode === 'project' && projectId) return { mode: 'project', projectId }
  return null
}

export const serializeWeatherChoice = (organizationId: string, choice: WeatherChoice) =>
  choice.mode === 'device' ? `${organizationId}:device` : `${organizationId}:project:${choice.projectId}`

export async function readWorkScope(userId: string): Promise<WorkScope> {
  return (await read(WORK_SCOPE_COOKIE, userId)) === 'mine' ? 'mine' : 'all'
}

/** Layout is also scoped to the workspace, so switching organizations never carries the choice across. */
export async function readLayoutPreference(userId: string, organizationId: string): Promise<LayoutPreference> {
  const raw = await read(LAYOUT_COOKIE, userId)
  if (!raw) return 'auto'
  const sep = raw.lastIndexOf(':')
  return sep > 0 && raw.slice(0, sep) === organizationId ? parseLayoutPreference(raw.slice(sep + 1)) : 'auto'
}

export async function writePreference(name: string, userId: string, value: string | null) {
  const store = await cookies()
  if (value === null) {
    store.delete(name)
    return
  }
  store.set(name, `${userId}|${value}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })
}
