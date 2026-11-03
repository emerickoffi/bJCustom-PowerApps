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
import { requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

/** Saves an explicit weather choice: `'device'` or an authorized, active project id. Never stores coordinates. */
export async function setWeatherLocationAction(choice: string): Promise<{ ok: boolean }> {
  const session = await requireStaff()
  if (choice === 'device') {
    await writePreference(
      WEATHER_LOCATION_COOKIE,
      session.userId,
      serializeWeatherChoice(session.organizationId, { mode: 'device' }),
    )
    return { ok: true }
  }
  if (!isProjectId(choice)) return { ok: false }
  const supabase = await createClient()
  const { data } = await supabase
    .from('projects')
    .select('id, status')
    .eq('organization_id', session.organizationId)
    .eq('id', choice)
    .maybeSingle()
  if (!data || !ACTIVE_PROJECT_STATUSES.includes(data.status as ProjectStatus)) return { ok: false }
  await writePreference(
    WEATHER_LOCATION_COOKIE,
    session.userId,
    serializeWeatherChoice(session.organizationId, { mode: 'project', projectId: choice }),
  )
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
  await writePreference(WORK_SCOPE_COOKIE, session.userId, scope === 'mine' ? 'mine' : null)
  revalidatePath('/dashboard')
}
