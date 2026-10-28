import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, CalendarClock, CalendarRange, ChevronRight, ClipboardCheck, Home, MapPin, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { WalkthroughStatusBadge } from '@/components/walkthroughs/badges'
import type { WalkthroughStatus } from '@/lib/walkthroughs'
import { getSession } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { createClient } from '@/lib/supabase/server'
import { EmptyState } from '@/components/shared/page-header'
import { ProjectStatusBadge } from '@/components/shared/status-badge'
import { ProgressRing } from '@/components/shared/progress'
import { getProjectCoverPhotos } from '@/lib/project-photos'
import { coverAlt } from '@/lib/project-cover'
import { PROJECT_PIPELINE, PROJECT_STATUS_LABELS, type ProjectStatus } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { getMySignatureTasks } from '@/app/actions/signatures'
import { buildHomeownerActions } from '@/lib/next-actions'
import { HomeownerActions } from '@/components/portal/homeowner-actions'

export const metadata: Metadata = { title: 'Your home' }

type PortalProject = {
  id: string
  project_number: string
  name: string
  status: ProjectStatus
  address_line1: string
  city: string
  state: string
  postal_code: string
  progress_percent: number | null
  proposed_start_date: string | null
  target_completion_date: string | null
  project_manager_name: string | null
}

function StageTracker({ status }: { status: ProjectStatus }) {
  const stage = PROJECT_PIPELINE.indexOf(status)
  if (stage < 0) return null
  const next = PROJECT_PIPELINE[stage + 1]
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-foreground">{`Stage ${stage + 1} of ${PROJECT_PIPELINE.length}: ${PROJECT_STATUS_LABELS[status]}`}</span>
        {next && <span className="text-xs text-muted-foreground">{`Up next: ${PROJECT_STATUS_LABELS[next]}`}</span>}
      </div>
      <ol className="flex gap-1" aria-label="Project stages">
        {PROJECT_PIPELINE.map((s, i) => (
          <li
            key={s}
            className={cn(
              'h-2 flex-1 rounded-full',
              i < stage ? 'bg-primary' : i === stage ? 'bg-champagne' : 'bg-sage',
            )}
          >
            <span className="sr-only">
              {`${PROJECT_STATUS_LABELS[s]}: ${i < stage ? 'complete' : i === stage ? 'current' : 'upcoming'}`}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function Fact({ icon: Icon, label, value }: { icon: typeof UserRound; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sage text-primary">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="truncate text-sm font-medium text-foreground">{value}</dd>
      </div>
    </div>
  )
}

export default async function PortalPage() {
  const session = await getSession()
  const supabase = await createClient()
  const features = session?.organizationId ? await getOrgFeatures(session.organizationId) : null
  const { data } = await supabase.rpc('get_portal_projects')
  const projects = (data ?? []) as PortalProject[]
  const ids = projects.map((p) => p.id)
  const [{ data: walkthroughRows }, photos] = await Promise.all([
    ids.length
      ? supabase
          .from('walkthroughs')
          .select('id, project_id, title, status, scheduled_date')
          .in('project_id', ids)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as { id: string; project_id: string; title: string; status: string; scheduled_date: string | null }[] }),
    getProjectCoverPhotos(ids),
  ])
  const walkthroughsByProject = new Map<string, NonNullable<typeof walkthroughRows>>()
  for (const w of walkthroughRows ?? []) {
    walkthroughsByProject.set(w.project_id, [...(walkthroughsByProject.get(w.project_id) ?? []), w])
  }
  const { data: warrantyRows } = ids.length
    ? await supabase.from('project_warranties').select('project_id').in('project_id', ids)
    : { data: [] as { project_id: string }[] }
  const warrantyProjects = new Set((warrantyRows ?? []).map((w) => w.project_id))
  const actionFeatures = {
    walkthroughs: features?.walkthroughs ?? false,
    documents: features?.documents ?? false,
    e_signatures: features?.e_signatures ?? false,
  }
  const [{ data: repairRows }, signatureTaskLists] = await Promise.all([
    ids.length && actionFeatures.walkthroughs
      ? supabase
          .from('project_issues')
          .select('id, project_id, walkthrough_id, item_label')
          .in('project_id', ids)
          .eq('status', 'resolved')
          .eq('homeowner_validation', 'pending')
          .not('builder_approved_at', 'is', null)
          .order('builder_approved_at', { ascending: true })
      : Promise.resolve({ data: [] as { id: string; project_id: string; walkthrough_id: string; item_label: string }[] }),
    actionFeatures.documents && actionFeatures.e_signatures
      ? Promise.all(ids.map(async (pid) => (await getMySignatureTasks(pid)).map((t) => ({ ...t, projectId: pid }))))
      : Promise.resolve([]),
  ])
  const homeownerActions = buildHomeownerActions({
    projects: projects.map((p) => ({ id: p.id, name: p.name })),
    features: actionFeatures,
    walkthroughs: walkthroughRows ?? [],
    repairsAwaitingConfirmation: repairRows ?? [],
    signatureTasks: signatureTaskLists.flat(),
  })
  const firstName = session?.fullName?.split(' ')[0]

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2.5 text-sm font-medium text-champagne">
          <span className="h-px w-6 bg-champagne" aria-hidden="true" />
          My Home
        </div>
        <h1 className="text-balance font-serif text-3xl font-semibold leading-tight text-foreground md:text-[2.6rem]">
          {firstName ? `Welcome home, ${firstName}.` : 'Welcome home.'}
        </h1>
        <p className="max-w-2xl text-pretty leading-relaxed text-muted-foreground">
          {`Follow every stage of your build with ${session?.brand.displayName ?? 'your builder'}: progress, timeline, and walkthroughs, all in one place.`}
        </p>
      </div>

      {projects.length > 0 && <HomeownerActions actions={homeownerActions} showProject={projects.length > 1} />}

      {projects.length ? (
        <ul className="flex flex-col gap-10">
          {projects.map((p) => {
            const progress = p.progress_percent === null ? null : Number(p.progress_percent)
            const cover = photos.get(p.id)
            const photoUrl = cover?.url
            const walkthroughs = walkthroughsByProject.get(p.id) ?? []
            return (
              <li key={p.id} className="flex flex-col gap-6">
                <article className="overflow-hidden rounded-3xl border border-border/70 bg-card shadow-lift">
                  <div className="relative h-56 sm:h-72">
                    {photoUrl ? (
                      <Image
                        src={photoUrl}
                        alt={coverAlt(cover?.kind, p.name)}
                        fill
                        sizes="(min-width: 1152px) 72rem, 100vw"
                        className="object-cover"
                        unoptimized
                        priority
                      />
                    ) : (
                      <div className="blueprint absolute inset-0" aria-hidden="true" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-brand-deep/90 via-brand-deep/30 to-transparent" aria-hidden="true" />
                    <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 p-6 text-white sm:flex-row sm:items-end sm:justify-between sm:p-8">
                      <div className="flex min-w-0 flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs text-white/70">{p.project_number}</span>
                          <ProjectStatusBadge status={p.status} />
                        </div>
                        <h2 className="text-balance font-serif text-2xl font-semibold leading-tight sm:text-3xl">{p.name}</h2>
                        <p className="flex items-start gap-1.5 text-sm text-white/80">
                          <MapPin className="mt-0.5 size-4 shrink-0 text-champagne" aria-hidden="true" />
                          {`${p.address_line1}, ${p.city}, ${p.state} ${p.postal_code}`}
                        </p>
                      </div>
                      {progress !== null && (
                        <div className="rounded-2xl bg-brand-deep/70 p-3 backdrop-blur-sm">
                          <ProgressRing value={progress} label="Overall progress" tone="light" size={88} stroke={7} />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-7 p-6 sm:p-8">
                    <StageTracker status={p.status} />
                    <dl className="grid gap-5 sm:grid-cols-3">
                      <Fact icon={UserRound} label="Project manager" value={p.project_manager_name ?? 'To be assigned'} />
                      <Fact icon={CalendarRange} label="Planned start" value={formatDate(p.proposed_start_date)} />
                      <Fact icon={CalendarClock} label="Target completion" value={formatDate(p.target_completion_date)} />
                    </dl>
                    <div className="flex flex-wrap gap-2 border-t pt-6">
                      {features?.schedule && (
                        <Button size="lg" render={<Link href={`/portal/projects/${p.id}/schedule`} />} nativeButton={false}>
                          Construction progress
                          <ArrowRight data-icon="inline-end" />
                        </Button>
                      )}
                      {features?.documents && (
                        <Button size="lg" variant="outline" render={<Link href={`/portal/projects/${p.id}/documents`} />} nativeButton={false}>
                          Documents & approvals
                        </Button>
                      )}
                      {walkthroughs.length > 0 && (
                        <Button size="lg" variant="outline" render={<Link href={`#walk-${p.id}`} />} nativeButton={false}>
                          Walkthroughs & issues
                        </Button>
                      )}
                      {warrantyProjects.has(p.id) && (
                        <Button size="lg" variant="outline" render={<Link href={`/portal/projects/${p.id}/warranty`} />} nativeButton={false}>
                          Warranty
                        </Button>
                      )}
                      {features?.invoices && (
                        <Button size="lg" variant="outline" render={<Link href="/portal/invoices" />} nativeButton={false}>
                          Invoices
                        </Button>
                      )}
                    </div>
                  </div>
                </article>

                {walkthroughs.length > 0 && (
                  <section aria-labelledby={`walk-${p.id}`} className="surface flex flex-col gap-4 p-5 md:p-6">
                    <div className="flex items-center gap-3">
                      <span className="flex size-10 items-center justify-center rounded-xl bg-champagne-soft text-champagne">
                        <ClipboardCheck className="size-4" aria-hidden="true" />
                      </span>
                      <div className="flex flex-col">
                        <h3 id={`walk-${p.id}`} className="font-serif text-lg font-semibold text-foreground">
                          Walkthroughs & issues
                        </h3>
                        <p className="text-sm text-muted-foreground">Review your home and track any repairs</p>
                      </div>
                    </div>
                    <ul className="flex flex-col gap-2">
                      {walkthroughs.map((w) => (
                        <li key={w.id}>
                          <Link
                            href={`/portal/walkthroughs/${w.id}`}
                            className="group flex items-center justify-between gap-3 rounded-xl border border-border/70 p-4 transition-colors hover:border-primary/30 hover:bg-sage/40"
                          >
                            <span className="flex min-w-0 flex-col gap-0.5">
                              <span className="truncate text-sm font-medium text-foreground">{w.title}</span>
                              <span className="text-xs text-muted-foreground">
                                {w.status === 'submitted'
                                  ? 'Submitted · track repairs'
                                  : w.scheduled_date
                                    ? `Scheduled ${formatDate(w.scheduled_date)}`
                                    : 'Ready for you'}
                              </span>
                            </span>
                            <span className="flex items-center gap-2">
                              <WalkthroughStatusBadge status={w.status as WalkthroughStatus} />
                              <ChevronRight
                                className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                                aria-hidden="true"
                              />
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <EmptyState
          icon={Home}
          title="Your project is being set up"
          description="Once your builder links your project, its progress will appear here."
        />
      )}
    </div>
  )
}
