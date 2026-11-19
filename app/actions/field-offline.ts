'use server'

import { requireStaff } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { createClient } from '@/lib/supabase/server'

/** Projects still on site: the ones a crew might need with no signal. */
const ON_SITE = ['preconstruction', 'under_construction', 'final_inspection', 'punch_list', 'substantially_complete']

/**
 * Pages this person should be able to open with no signal: their home pages plus, for up to six active jobs
 * they can see, the project page, its daily log list and a blank daily log form. Read-only and RLS-scoped.
 */
export async function fieldOfflinePagesAction(): Promise<string[]> {
  const session = await requireStaff()
  const supabase = await createClient()
  const [features, { data }] = await Promise.all([
    getOrgFeatures(session.organizationId),
    supabase
      .from('projects')
      .select('id')
      .eq('organization_id', session.organizationId)
      .is('archived_at', null)
      .in('status', ON_SITE)
      .order('updated_at', { ascending: false })
      .limit(6),
  ])
  const paths = ['/dashboard', '/my-work']
  for (const p of data ?? []) {
    paths.push(`/projects/${p.id}`)
    if (features.daily_logs) paths.push(`/projects/${p.id}/daily-logs`, `/projects/${p.id}/daily-logs/new`)
  }
  return paths
}
