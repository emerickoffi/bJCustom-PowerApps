'use server'

import { revalidatePath } from 'next/cache'
import { isProjectId } from '@/lib/route-job'
import {
  LAYOUT_COOKIE,
  serializeWeatherChoice,
  WEATHER_LOCATION_COOKIE,
  WORK_SCOPE_COOKIE,
  writePreference,
} from '@/lib/dashboard-prefs'
import { ACTIVE_PROJECT_STATUSES, type ProjectStatus } from '@/lib/domain'
import { LAYOUT_PREFERENCES, parseLayoutPreference } from '@/lib/ui-layout'
import { normalizePlaceQuery, type FixedWeatherChoice, type WeatherChoice } from '@/lib/weather'
import { requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

/** Parses `'place:<city or ZIP>'` or a project id, re-checking any project against the viewer's active projects. */
async function resolveFixedChoice(value: string, organizationId: string): Promise<FixedWeatherChoice | null> {
  if (value.startsWith('place:')) {
    const query = normalizePlaceQuery(value.slice('place:'.length))
    return query ? { mode: 'place', query } : null
  }
  if (!isProjectId(value)) return null
  const supabase = await createClient()
  const { data } = await supabase
    .from('projects')
    .select('id, status')
    .eq('organization_id', organizationId)
    .eq('id', value)
    .maybeSingle()
  if (!data || !ACTIVE_PROJECT_STATUSES.includes(data.status as ProjectStatus)) return null
  return { mode: 'project', projectId: value }
}

/**
 * Saves an explicit weather choice: `'device'`, an authorized active project id, or `'place:<city or ZIP>'`.
 * For `'device'`, `fallback` keeps the last fixed location so weather still shows when the device can't be located.
 * Never stores coordinates.
 */
export async function setWeatherLocationAction(choice: string, fallback?: string | null): Promise<{ ok: boolean }> {
  const session = await requireStaff()
  let next: WeatherChoice | null
  if (choice === 'device') {
    const fixed = fallback ? await resolveFixedChoice(fallback, session.organizationId) : null
    next = fixed ? { mode: 'device', fallback: fixed } : { mode: 'device' }
  } else {
    next = await resolveFixedChoice(choice, session.organizationId)
  }
  if (!next) return { ok: false }
  await writePreference(WEATHER_LOCATION_COOKIE, session.userId, serializeWeatherChoice(session.organizationId, next))
  return { ok: true }
}

export async function setLayoutPreferenceAction(preference: string): Promise<{ ok: boolean }> {
  const session = await requireStaff()
  if (!(LAYOUT_PREFERENCES as readonly string[]).includes(preference)) return { ok: false }
  const value = parseLayoutPreference(preference)
  await writePreference(LAYOUT_COOKIE, session.userId, value === 'auto' ? null : `${session.organizationId}:${value}`)
  revalidatePath('/', 'layout')
  return { ok: true }
}

export async function setWorkScopeAction(scope: 'all' | 'mine'): Promise<void> {
  const session = await requireStaff()
  // Stored explicitly so "All work" survives now that My work is the default.
  await writePreference(WORK_SCOPE_COOKIE, session.userId, scope === 'all' ? 'all' : 'mine')
  revalidatePath('/dashboard')
}
