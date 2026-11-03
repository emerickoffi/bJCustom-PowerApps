import 'server-only'
import { cookies } from 'next/headers'

/**
 * Per-user dashboard preferences kept in cookies. Each value is bound to the user id so a shared browser never
 * carries one person's choice into another's session; any saved project id is re-validated under RLS before use.
 */
export const WEATHER_LOCATION_COOKIE = 'dash_weather_location'
export const WORK_SCOPE_COOKIE = 'dash_work_scope'

export type WorkScope = 'all' | 'mine'

const read = async (name: string, userId: string) => {
  const raw = (await cookies()).get(name)?.value
  if (!raw) return null
  const sep = raw.indexOf('|')
  return sep > 0 && raw.slice(0, sep) === userId ? raw.slice(sep + 1) : null
}

export async function readWeatherLocation(userId: string): Promise<string | null> {
  return read(WEATHER_LOCATION_COOKIE, userId)
}

export async function readWorkScope(userId: string): Promise<WorkScope> {
  return (await read(WORK_SCOPE_COOKIE, userId)) === 'mine' ? 'mine' : 'all'
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
