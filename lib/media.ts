import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { MEDIA_BUCKET } from '@/lib/walkthroughs'

/** Creates short-lived signed URLs; storage RLS decides which paths the user may read. */
export async function signMediaPaths(paths: string[], bucket: string = MEDIA_BUCKET): Promise<Map<string, string>> {
  const unique = [...new Set(paths)]
  if (!unique.length) return new Map()
  const supabase = await createClient()
  const { data } = await supabase.storage.from(bucket).createSignedUrls(unique, 60 * 60)
  const map = new Map<string, string>()
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl) map.set(entry.path, entry.signedUrl)
  }
  return map
}
