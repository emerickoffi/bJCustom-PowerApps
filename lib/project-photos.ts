import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { signMediaPaths } from '@/lib/media'

type Row = { storage_path: string; walkthroughs: { project_id: string } | { project_id: string }[] | null }

/** Latest real site photo per project (from walkthrough uploads), as signed URLs. */
export async function getProjectCoverPhotos(projectIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(projectIds)]
  if (!ids.length) return new Map()
  const supabase = await createClient()
  const { data } = await supabase
    .from('walkthrough_attachments')
    .select('storage_path, walkthroughs!inner(project_id)')
    .eq('media_kind', 'photo')
    .in('walkthroughs.project_id', ids)
    .order('created_at', { ascending: false })
    .limit(ids.length * 4)

  const pathByProject = new Map<string, string>()
  for (const row of (data ?? []) as Row[]) {
    const w = Array.isArray(row.walkthroughs) ? row.walkthroughs[0] : row.walkthroughs
    if (w && !pathByProject.has(w.project_id)) pathByProject.set(w.project_id, row.storage_path)
  }
  const signed = await signMediaPaths([...pathByProject.values()])
  const result = new Map<string, string>()
  for (const [projectId, path] of pathByProject) {
    const url = signed.get(path)
    if (url) result.set(projectId, url)
  }
  return result
}
