import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { Megaphone } from 'lucide-react'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { createClient } from '@/lib/supabase/server'
import { CLIENT_UPDATE_SECTIONS, formatPeriod } from '@/lib/client-updates'
import { formatDate } from '@/lib/format'
import { EmptyState, PageHeader } from '@/components/shared/page-header'

export const metadata: Metadata = { title: 'Progress updates' }

type Publication = {
  id: string
  client_update_id: string
  revision: number
  title: string
  period_start: string
  period_end: string
  overview: string | null
  completed_work: string | null
  in_progress_work: string | null
  upcoming_work: string | null
  homeowner_message: string | null
  author_name: string | null
  published_at: string
}
type PublicationPhoto = { id: string; publication_id: string; caption: string | null; is_cover: boolean; sort_order: number }

export default async function HomeownerUpdatesPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) redirect('/auth/login')
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()

  const supabase = await createClient()
  const [{ data: projects }, features] = await Promise.all([
    supabase.rpc('get_portal_projects'),
    session.organizationId ? getOrgFeatures(session.organizationId) : Promise.resolve(null),
  ])
  const project = ((projects ?? []) as { id: string; name: string }[]).find((p) => p.id === id)
  if (!project || !features?.client_updates) notFound()

  const { data } = await supabase
    .from('client_update_publications')
    .select('id, client_update_id, revision, title, period_start, period_end, overview, completed_work, in_progress_work, upcoming_work, homeowner_message, author_name, published_at')
    .eq('project_id', id)
    .order('published_at', { ascending: false })
    .limit(200)

  // Each update shows only its latest published revision.
  const latest = new Map<string, Publication>()
  for (const p of (data ?? []) as Publication[]) {
    const cur = latest.get(p.client_update_id)
    if (!cur || p.revision > cur.revision) latest.set(p.client_update_id, p)
  }
  const updates = [...latest.values()].sort((a, b) => b.period_end.localeCompare(a.period_end))

  const { data: photoRows } = updates.length
    ? await supabase.from('client_update_publication_photos').select('id, publication_id, caption, is_cover, sort_order').in('publication_id', updates.map((u) => u.id)).order('sort_order')
    : { data: [] }
  const photosBy = new Map<string, PublicationPhoto[]>()
  for (const ph of (photoRows ?? []) as PublicationPhoto[]) photosBy.set(ph.publication_id, [...(photosBy.get(ph.publication_id) ?? []), ph])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Progress updates" description={`Updates from your builder about ${project.name}.`} icon={Megaphone} backHref="/portal" backLabel="My home" />
      {updates.length === 0 ? (
        <EmptyState icon={Megaphone} title="No updates yet" description="Your builder will post progress reports here as work moves along." />
      ) : (
        <ol className="flex flex-col gap-6">
          {updates.map((u) => {
            const photos = photosBy.get(u.id) ?? []
            const cover = photos.find((p) => p.is_cover) ?? photos[0]
            const rest = photos.filter((p) => p !== cover)
            return (
              <li key={u.id}>
                <article className="surface overflow-hidden" aria-labelledby={`update-${u.id}`}>
                  {cover && (
                    <figure>
                      {/* eslint-disable-next-line @next/next/no-img-element -- redirects to a short-lived signed URL */}
                      <img src={`/api/client-updates/photos/${cover.id}`} alt={cover.caption || `Photo from ${u.title}`} className="aspect-[16/7] w-full object-cover" />
                      {cover.caption && <figcaption className="px-6 pt-3 text-sm text-muted-foreground">{cover.caption}</figcaption>}
                    </figure>
                  )}
                  <div className="flex flex-col gap-5 p-6">
                    <header className="flex flex-col gap-1">
                      <p className="text-sm text-muted-foreground">{formatPeriod(u.period_start, u.period_end)}</p>
                      <h2 id={`update-${u.id}`} className="text-balance text-xl font-semibold text-foreground">
                        {u.title}
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        Posted {formatDate(u.published_at)}
                        {u.author_name ? ` by ${u.author_name}` : ''}
                        {u.revision > 1 ? ' · Updated' : ''}
                      </p>
                    </header>
                    {CLIENT_UPDATE_SECTIONS.map((s) =>
                      u[s.key] ? (
                        <section key={s.key} className="flex flex-col gap-1.5">
                          <h3 className="text-sm font-semibold text-foreground">{s.label}</h3>
                          <p className="whitespace-pre-line text-pretty leading-relaxed text-foreground/90">{u[s.key]}</p>
                        </section>
                      ) : null,
                    )}
                    {rest.length > 0 && (
                      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {rest.map((p) => (
                          <li key={p.id}>
                            <figure className="flex flex-col gap-1">
                              {/* eslint-disable-next-line @next/next/no-img-element -- redirects to a short-lived signed URL */}
                              <img src={`/api/client-updates/photos/${p.id}`} alt={p.caption || 'Progress photo'} loading="lazy" className="aspect-square w-full rounded-md object-cover" />
                              {p.caption && <figcaption className="text-xs text-muted-foreground">{p.caption}</figcaption>}
                            </figure>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </article>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
