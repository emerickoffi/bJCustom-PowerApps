'use server'

import { revalidatePath } from 'next/cache'
import { isProjectId } from '@/lib/route-job'
import { LAYOUT_COOKIE, WEATHER_LOCATION_COOKIE, WORK_SCOPE_COOKIE, writePreference } from '@/lib/dashboard-prefs'
import { LAYOUT_PREFERENCES, parseLayoutPreference } from '@/lib/ui-layout'
import { requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export async function setWeatherLocationAction(projectId: string | null): Promise<{ ok: boolean }> {
  const session = await requireStaff()
  if (projectId === null) {
    await writePreference(WEATHER_LOCATION_COOKIE, session.userId, null)
    return { ok: true }
  }
  if (!isProjectId(projectId)) return { ok: false }
  const supabase = await createClient()
  const { data } = await supabase
    .from('projects')
    .select('id')
    .eq('organization_id', session.organizationId)
    .eq('id', projectId)
    .maybeSingle()
  if (!data) return { ok: false }
  await writePreference(WEATHER_LOCATION_COOKIE, session.userId, projectId)
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
