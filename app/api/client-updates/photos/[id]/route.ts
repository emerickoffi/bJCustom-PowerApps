import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { MEDIA_BUCKET } from '@/lib/walkthroughs'

/**
 * Serves a published client-update photo. The RLS-scoped lookup proves the caller may see the publication
 * (staff with project access, or a linked homeowner with the feature on); only then is the internal storage
 * path read with the service role and exchanged for a short-lived signed URL. The path never reaches the browser.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!z.uuid().safeParse(id).success) return new NextResponse(null, { status: 404 })

  const supabase = await createClient()
  const { data: visible } = await supabase.from('client_update_publication_photos').select('id').eq('id', id).maybeSingle()
  if (!visible) return new NextResponse(null, { status: 404 })

  const admin = createAdminClient()
  const { data: row } = await admin.from('client_update_publication_photos').select('storage_path').eq('id', id).maybeSingle()
  if (!row?.storage_path) return new NextResponse(null, { status: 404 })
  const { data: signed } = await admin.storage.from(MEDIA_BUCKET).createSignedUrl(row.storage_path, 300)
  if (!signed?.signedUrl) return new NextResponse(null, { status: 404 })

  return NextResponse.redirect(signed.signedUrl, { status: 302, headers: { 'Cache-Control': 'private, no-store' } })
}
