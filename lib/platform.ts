import 'server-only'
import { cache } from 'react'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSession, type SessionContext } from '@/lib/session'
import type {
  PlatformCompanyDetail,
  PlatformCompanyRow,
  PlatformEvent,
  PlatformOverview,
  PlatformPlan,
  PlatformUser,
} from '@/lib/platform-shared'

/** True when the signed-in user is a Trefort platform administrator. Never throws. */
export const isPlatformAdmin = cache(async (): Promise<boolean> => {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('is_platform_admin')
  return !error && data === true
})

/**
 * Guards every owner-console page and action. Anyone else gets a plain 404, so the console's existence is not
 * advertised. The database functions check the same thing again on every call.
 */
export async function requirePlatformAdmin(): Promise<SessionContext> {
  const session = await getSession()
  if (!session) redirect('/auth/login')
  if (!(await isPlatformAdmin())) notFound()
  return session
}

export async function loadPlatformOverview(): Promise<PlatformOverview | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('platform_overview')
  return error ? null : (data as PlatformOverview)
}

export async function loadPlatformCompanies(): Promise<PlatformCompanyRow[] | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('platform_list_organizations')
  if (error) return null
  return ((data ?? []) as PlatformCompanyRow[]).map((r) => ({
    ...r,
    staff_count: Number(r.staff_count),
    homeowner_count: Number(r.homeowner_count),
    project_count: Number(r.project_count),
    admin_emails: r.admin_emails ?? [],
  }))
}

export async function loadPlatformCompany(id: string): Promise<PlatformCompanyDetail | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('platform_get_organization', { p_org: id })
  if (error || !data) return null
  return data as PlatformCompanyDetail
}

export async function loadPlatformEvents(limit = 15): Promise<PlatformEvent[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('platform_recent_events', { p_limit: limit })
  return error ? [] : ((data ?? []) as PlatformEvent[])
}

export async function findPlatformUsers(query: string): Promise<PlatformUser[] | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('platform_find_users', { p_query: query })
  return error ? null : ((data ?? []) as PlatformUser[])
}

/** Empty when the subscription plans migration has not been applied yet. */
export async function loadPlatformPlans(): Promise<PlatformPlan[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('platform_list_plans')
  return error ? [] : ((data ?? []) as PlatformPlan[])
}
