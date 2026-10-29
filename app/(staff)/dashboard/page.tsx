import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, FolderKanban, HardHat, Plus, UserPlus, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { requireStaff, canManage } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { EmptyState, SectionHeading } from '@/components/shared/page-header'
import { StatCard } from '@/components/dashboard/stat-card'
import { PipelineOverview } from '@/components/dashboard/pipeline-overview'
import { RecentActivity } from '@/components/dashboard/recent-activity'
import { NotificationsCard } from '@/components/walkthroughs/notifications-card'
import { CompactProjectCard } from '@/components/dashboard/compact-project-card'
import { ProgressRing } from '@/components/shared/progress'
import { ACTIVE_PROJECT_STATUSES, PROJECT_STATUS_LABELS, type ProjectStatus } from '@/lib/domain'
import {
  parsePortfolioStatus,
  portfolioStatusCounts,
  portfolioViewAllHref,
  rankPortfolio,
  type PortfolioRow,
} from '@/lib/portfolio'
import { loadPortfolioSignals } from '@/lib/portfolio-data'
import { PortfolioStatusFilter } from '@/components/dashboard/portfolio-status-filter'
import { PROJECT_SUMMARY_COLUMNS, type ProjectSummary } from '@/lib/queries'
import { getOrgFeatures } from '@/lib/features'
import { getDashboardCardDetails } from '@/lib/dashboard-cards'
import { getProjectCoverPhotos } from '@/lib/project-photos'
import { loadDashboardAttention } from '@/lib/attention-data'

export const metadata: Metadata = { title: 'Dashboard' }

function greeting() {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Chicago' }).format(new Date()),
  )
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ portfolio?: string }>
}) {
  const session = await requireStaff()
  const supabase = await createClient()
  const orgId = session.organizationId
  const selectedStatus = parsePortfolioStatus((await searchParams).portfolio)
  const features = await getOrgFeatures(orgId)

  const [projectsRes, clientCountRes, leadCountRes, activityRes, signals] = await Promise.all([
    supabase
      .from('projects')
      .select('id, status, progress_percent, updated_at')
      .eq('organization_id', orgId)
      .is('archived_at', null),
    supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('status', 'active'),
    supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('status', 'lead'),
    supabase
      .from('client_activity')
      .select('id, activity_type, summary, created_at, client_id, clients(first_name, last_name)')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(8),
    loadPortfolioSignals(orgId, session.userId, features.schedule),
  ])

  const rows = (projectsRes.data ?? []) as (PortfolioRow & { progress_percent: number | null })[]
  const counts = rows.reduce<Partial<Record<ProjectStatus, number>>>((acc, r) => {
    const s = r.status as ProjectStatus
    acc[s] = (acc[s] ?? 0) + 1
    return acc
  }, {})
  const active = rows.filter((r) => ACTIVE_PROJECT_STATUSES.includes(r.status as ProjectStatus))
  const tracked = active.filter((r) => r.progress_percent !== null)
  const avgProgress = tracked.length
    ? tracked.reduce((sum, r) => sum + Number(r.progress_percent), 0) / tracked.length
    : 0
  const underConstruction = counts.under_construction ?? 0
  const manager = canManage(session.role)
  const firstName = session.fullName?.split(' ')[0]

  const statusCounts = portfolioStatusCounts(rows)
  const rankedIds = rankPortfolio(rows, signals, selectedStatus)
  const { data: portfolioData } = rankedIds.length
    ? await supabase
        .from('projects')
        .select(`${PROJECT_SUMMARY_COLUMNS}, completion_date`)
        .eq('organization_id', orgId)
        .in('id', rankedIds)
    : { data: [] }
  const byId = new Map(
    ((portfolioData ?? []) as unknown as (ProjectSummary & { completion_date: string | null })[]).map((p) => [p.id, p]),
  )
  const recent = rankedIds.flatMap((id) => byId.get(id) ?? [])
  const viewAllHref = portfolioViewAllHref(selectedStatus)
  const [photos, cardDetails, attention] = await Promise.all([
    getProjectCoverPhotos(recent.map((p) => p.id)),
    getDashboardCardDetails(orgId, recent, features),
    loadDashboardAttention(orgId, session.userId, features),
  ])

  return (
    <div className="flex flex-col gap-8">
      <section
        aria-labelledby="welcome-heading"
        className="relative overflow-hidden rounded-3xl bg-brand-deep text-white shadow-lift"
      >
        <div className="blueprint absolute inset-0 opacity-60" aria-hidden="true" />
        <div className="relative flex flex-col gap-8 p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between lg:p-10">
          <div className="flex max-w-xl flex-col gap-4">
            <div className="flex items-center gap-2.5 text-sm font-medium text-champagne">
              <span className="h-px w-6 bg-champagne" aria-hidden="true" />
              {session.brand.displayName}
            </div>
            <h1 id="welcome-heading" className="text-balance font-serif text-3xl font-semibold leading-tight md:text-[2.6rem]">
              {firstName ? `${greeting()}, ${firstName}.` : `${greeting()}.`}
            </h1>
            <p className="text-pretty leading-relaxed text-white/75">
              {active.length
                ? `You have ${active.length} ${active.length === 1 ? 'home' : 'homes'} in progress, with ${underConstruction} under construction right now.`
                : 'Your homes in progress, clients, and site activity will come together here.'}
            </p>
            {manager && (
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  size="lg"
                  render={<Link href="/projects/new" />}
                  nativeButton={false}
                  className="bg-champagne text-white hover:bg-champagne/90"
                >
                  <Plus data-icon="inline-start" />
                  New project
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  render={<Link href="/clients/new" />}
                  nativeButton={false}
                  className="border-white/25 bg-white/5 text-white hover:bg-white/15 hover:text-white"
                >
                  <UserPlus data-icon="inline-start" />
                  New client
                </Button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-5 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
            <ProgressRing value={avgProgress} label="Average progress across active homes" tone="light" size={112} stroke={9} />
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-white">Portfolio progress</span>
              <span className="max-w-40 text-xs leading-relaxed text-white/65">
                Average completion across all active homes
              </span>
            </div>
          </div>
        </div>
      </section>

      <section aria-label="Key figures" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active projects" value={active.length} href="/projects" icon={FolderKanban} hint="Planning through punch list" />
        <StatCard
          label="Under construction"
          value={underConstruction}
          href="/projects?status=under_construction"
          icon={HardHat}
          hint="Crews on site"
        />
        <StatCard
          label="Active clients"
          value={clientCountRes.count ?? 0}
          href="/clients?status=active"
          icon={Users}
          hint="Homeowners with live projects"
        />
        <StatCard
          label="Open leads"
          value={leadCountRes.count ?? 0}
          href="/clients?status=lead"
          icon={UserPlus}
          accent="champagne"
          hint="Prospective homeowners"
        />
      </section>

      <section aria-labelledby="homes-heading" className="flex flex-col gap-5">
        <SectionHeading
          id="homes-heading"
          title="Project Portfolio"
          description="Your construction projects at every stage."
          action={
            <Link
              href={viewAllHref}
              className="group flex shrink-0 items-center gap-1.5 text-sm font-medium text-primary"
            >
              Open Project Directory
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          }
        />
        {rows.length > 0 && (
          <PortfolioStatusFilter counts={statusCounts} total={rows.length} selected={selectedStatus} />
        )}
        {recent.length ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {recent.map((p) => (
              <CompactProjectCard
                key={p.id}
                project={{
                  ...p,
                  completion_date: p.completion_date ?? null,
                  photoUrl: photos.get(p.id)?.url ?? null,
                  photoKind: photos.get(p.id)?.kind ?? null,
                  details: cardDetails.get(p.id)!,
                  warrantyEnabled: features.warranty,
                }}
              />
            ))}
          </div>
        ) : selectedStatus && rows.length ? (
          <EmptyState
            icon={FolderKanban}
            title="No projects in this status."
            description={`There are no ${PROJECT_STATUS_LABELS[selectedStatus]} projects right now.`}
            action={
              <Button variant="outline" render={<Link href="/dashboard" scroll={false} />} nativeButton={false}>
                Show all projects
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={FolderKanban}
            title="No projects yet"
            description={
              manager
                ? 'Create a client, then start your first custom home project.'
                : 'Projects you are assigned to will appear here.'
            }
            action={
              manager && (
                <Button render={<Link href="/projects/new" />} nativeButton={false}>
                  Create project
                </Button>
              )
            }
          />
        )}
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <PipelineOverview counts={counts} />
        <div className="flex flex-col gap-6">
          <NotificationsCard
            items={attention.items}
            total={attention.total}
            totalIsLowerBound={attention.totalIsLowerBound}
          />
          <RecentActivity
            items={(activityRes.data ?? []) as unknown as Parameters<typeof RecentActivity>[0]['items']}
            updates={attention.updates}
          />
        </div>
      </div>
    </div>
  )
}
