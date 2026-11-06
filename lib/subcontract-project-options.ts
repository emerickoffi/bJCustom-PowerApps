import type { createClient } from '@/lib/supabase/server'

type Supabase = Awaited<ReturnType<typeof createClient>>

export type SubWorkProjectOption = { id: string; name: string }

/**
 * Projects the signed-in user may open in Sub work. Each candidate is checked with the same
 * `can_view_project_internal` guard the destination page enforces, so the switcher never offers a
 * project that would 404. The current project is always kept so the selector reflects the page.
 */
export async function loadSubWorkProjectOptions(
  supabase: Supabase,
  organizationId: string,
  current: SubWorkProjectOption,
): Promise<SubWorkProjectOption[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('id, name')
    .eq('organization_id', organizationId)
    .is('archived_at', null)
    .order('name')
    .limit(500)
  if (error || !data) return [current]

  const candidates = (data as SubWorkProjectOption[]).filter((p) => p.id !== current.id)
  const checks = await Promise.all(
    candidates.map((p) => supabase.rpc('can_view_project_internal', { p_project: p.id }).then(({ data: ok }) => Boolean(ok))),
  )
  const allowed = candidates.filter((_, i) => checks[i])
  return [current, ...allowed].sort((a, b) => a.name.localeCompare(b.name))
}
