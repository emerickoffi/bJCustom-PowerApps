import 'server-only'
import { createHash } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { signMediaPaths } from '@/lib/media'
import { isCoverKind, type ProjectCover } from '@/lib/project-cover'

type Supabase = Awaited<ReturnType<typeof createClient>>

type Row = { storage_path: string; walkthroughs: { project_id: string } | { project_id: string }[] | null }

/**
 * One cover per project, as signed URLs: the chosen project cover image when set,
 * otherwise the latest real site photo from walkthrough uploads.
 */
export async function getProjectCoverPhotos(projectIds: string[]): Promise<Map<string, ProjectCover>> {
  const supabase = await createClient()
  const chosen = await resolveProjectCoverPaths(supabase, projectIds)
  const signed = await signMediaPaths([...chosen.values()].map((c) => c.path))
  const result = new Map<string, ProjectCover>()
  for (const [projectId, { path, kind }] of chosen) {
    const url = signed.get(path)
    if (url) result.set(projectId, { url, kind, thumbUrl: coverThumbUrl(projectId, path) })
  }
  return result
}

/**
 * Small square version of the cover for map pins. The version in the address changes whenever the cover image
 * changes, so browsers can cache each thumbnail for good.
 */
export function coverThumbUrl(projectId: string, path: string): string {
  return `/api/projects/${projectId}/thumb?v=${createHash('sha1').update(path).digest('hex').slice(0, 12)}`
}

/**
 * Which image is each project's cover, as storage paths, read as the signed-in user: the chosen cover when set,
 * otherwise the latest walkthrough photo. Row-level security decides which projects come back.
 */
export async function resolveProjectCoverPaths(
  supabase: Supabase,
  projectIds: string[],
): Promise<Map<string, { path: string; kind: ProjectCover['kind'] }>> {
  const ids = [...new Set(projectIds)]
  if (!ids.length) return new Map()

  const chosen = new Map<string, { path: string; kind: ProjectCover['kind'] }>()
  const { data: covers } = await supabase
    .from('projects')
    .select('id, cover_image_path, cover_image_kind')
    .in('id', ids)
    .not('cover_image_path', 'is', null)
  for (const p of covers ?? []) {
    if (p.cover_image_path) {
      chosen.set(p.id, { path: p.cover_image_path, kind: isCoverKind(p.cover_image_kind) ? p.cover_image_kind : null })
    }
  }

  const fallbackIds = ids.filter((id) => !chosen.has(id))
  if (fallbackIds.length) {
    const { data } = await supabase
      .from('walkthrough_attachments')
      .select('storage_path, walkthroughs!inner(project_id)')
      .eq('media_kind', 'photo')
      .in('walkthroughs.project_id', fallbackIds)
      .order('created_at', { ascending: false })
      .limit(fallbackIds.length * 4)
    for (const row of (data ?? []) as Row[]) {
      const w = Array.isArray(row.walkthroughs) ? row.walkthroughs[0] : row.walkthroughs
      if (w && !chosen.has(w.project_id)) chosen.set(w.project_id, { path: row.storage_path, kind: 'site_photo' })
    }
  }

  return chosen
}
