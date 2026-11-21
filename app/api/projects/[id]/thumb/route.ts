import { z } from 'zod'
import sharp from 'sharp'
import { getSession } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { MEDIA_BUCKET } from '@/lib/walkthroughs'
import { coverThumbUrl, resolveProjectCoverPaths } from '@/lib/project-photos'

export const runtime = 'nodejs'

/** Twice the largest pin size, so the photo stays sharp on phone screens. */
const SIZE = 96
const THUMB_PREFIX = `thumbs/v1/${SIZE}`

function notFound() {
  return new Response(null, { status: 404, headers: { 'Cache-Control': 'private, max-age=300' } })
}

/**
 * A project's cover as a small square JPEG, for map pins. Whether the person may see the project is decided by
 * row-level security when the cover is looked up as them. The thumbnail is made once from the full-size image,
 * kept in storage, and served from there afterwards, so a map of fifty jobs downloads kilobytes, not megabytes.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return new Response(null, { status: 401 })
  const { id } = await params
  if (!z.uuid().safeParse(id).success) return notFound()

  const cover = (await resolveProjectCoverPaths(await createClient(), [id])).get(id)
  if (!cover) return notFound()

  // The address carries a version of the cover path. A current version can be cached for good; an old one
  // (the cover changed since the page loaded) gets the new image but only briefly.
  const current = new URL(coverThumbUrl(id, cover.path), 'http://x').searchParams.get('v')
  const requested = new URL(request.url).searchParams.get('v')
  const cacheControl = requested === current ? 'private, max-age=31536000, immutable' : 'private, max-age=60'

  const storage = createAdminClient().storage.from(MEDIA_BUCKET)
  const thumbPath = `${THUMB_PREFIX}/${cover.path}.jpg`

  let bytes: Uint8Array | null = null
  const existing = await storage.download(thumbPath)
  if (existing.data) {
    bytes = new Uint8Array(await existing.data.arrayBuffer())
  } else {
    const source = await storage.download(cover.path)
    if (!source.data) return notFound()
    try {
      const buffer = await sharp(Buffer.from(await source.data.arrayBuffer()), { failOn: 'none' })
        .rotate() // respect the phone's orientation
        .resize(SIZE, SIZE, { fit: 'cover', position: 'attention' })
        .jpeg({ quality: 72, mozjpeg: true })
        .toBuffer()
      bytes = new Uint8Array(buffer)
    } catch {
      // A format sharp cannot read (e.g. some HEIC files): the pin falls back to its colored dot.
      return notFound()
    }
    // Saving is best effort: if it fails, the next request simply makes the thumbnail again.
    await storage.upload(thumbPath, bytes, { contentType: 'image/jpeg', upsert: true, cacheControl: '31536000' })
  }

  return new Response(bytes as unknown as BodyInit, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Length': String(bytes.byteLength),
      'Cache-Control': cacheControl,
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
