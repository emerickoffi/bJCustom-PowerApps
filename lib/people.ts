import 'server-only'
import { createClient } from '@/lib/supabase/server'

/** Display names for a set of user IDs, resolved through RLS-scoped profiles. */
export async function getPeopleNames(ids: (string | null | undefined)[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))]
  if (!unique.length) return {}
  const supabase = await createClient()
  const { data } = await supabase.from('profiles').select('id, full_name, email').in('id', unique)
  return Object.fromEntries((data ?? []).map((p) => [p.id as string, (p.full_name || p.email || 'Team member') as string]))
}
