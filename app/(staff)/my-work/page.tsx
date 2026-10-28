import type { Metadata } from 'next'
import { CalendarCheck2, FolderKanban, TriangleAlert } from 'lucide-react'
import { requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { getOrgFeatures } from '@/lib/features'
import { getDashboardCardDetails } from '@/lib/dashboard-cards'
import { getProjectCoverPhotos } from '@/lib/project-photos'
import { PROJECT_SUMMARY_COLUMNS, type ProjectSummary } from '@/lib/queries'
import { todayIso, type ActivityStatus } from '@/lib/schedule'
import { assignedProjectsFilter, splitAssignedActivities } from '@/lib/my-work'
import { EmptyState, PageHeader, SectionHeading } from '@/components/shared/page-header'
import { CompactProjectCard } from '@/components/dashboard/compact-project-card'
import { WorkItemList, type WorkItem } from '@/components/my-work/work-item-list'
import { ACTIVITY_STATUS_LABELS } from '@/lib/schedule'
import { ISSUE_STATUS_LABELS, type IssueStatus } from '@/lib/walkthroughs'
import { formatDate } from '@/lib/format'

export const metadata: Metadata = { title: 'My Work' }

type ActivityRow = {
  id: string
  project_id: string
  name: string
  status: ActivityStatus
  planned_start: string | null
  planned_end: string | null
  projects: { name: string; project_number: string } | null
}

type IssueRow = {
  id: string
  project_id: string
  item_label: string
  category: string
  status: IssueStatus
  reported_at: string
  projects: { name: string; project_number: string } | null
}

export default async function MyWorkPage() {
  const session = await requireStaff()
  const supabase = await createClient()
  const orgId = session.organizationId
  const features = await getOrgFeatures(orgId)

  const { data: memberRows } = await supabase
    .from('project_members')
    .select('project_id')
    .eq('organization_id', orgId)
    .eq('user_id', session.userId)
  const memberProjectIds = (memberRows ?? []).map((m) => m.project_id as string)

  const [projectsRes, activitiesRes, issuesRes] = await Promise.all([
    supabase
      .from('projects')
      .select(`${PROJECT_SUMMARY_COLUMNS}, completion_date`)
      .eq('organization_id', orgId)
      .is('archived_at', null)
      .or(assignedProjectsFilter(session.userId, memberProjectIds))
      .order('updated_at', { ascending: false })
      .limit(24),
    features.schedule
      ? supabase
          .from('schedule_activities')
          .select('id, project_id, name, status, planned_start, planned_end, projects(name, project_number)')
          .eq('organization_id', orgId)
          .eq('assigned_to', session.userId)
          .not('status', 'in', '(completed,skipped)')
          .order('planned_end', { ascending: true, nullsFirst: false })
          .limit(60)
      : Promise.resolve({ data: [] as ActivityRow[] }),
    features.walkthroughs && features.issues
      ? supabase
          .from('project_issues')
          .select('id, project_id, item_label, category, status, reported_at, projects(name, project_number)')
          .eq('organization_id', orgId)
          .eq('responsible_user_id', session.userId)
          .in('status', ['open', 'in_progress'])
          .order('reported_at', { ascending: true })
          .limit(30)
      : Promise.resolve({ data: [] as IssueRow[] }),
  ])

  const projects = (projectsRes.data ?? []) as unknown as (ProjectSummary & { completion_date: string | null })[]
  const [photos, cardDetails] = await Promise.all([
    getProjectCoverPhotos(projects.map((p) => p.id)),
    getDashboardCardDetails(orgId, projects, features),
  ])

  const today = todayIso()
  const { attention, upcoming } = splitAssignedActivities((activitiesRes.data ?? []) as unknown as ActivityRow[], today)
  const issues = (issuesRes.data ?? []) as unknown as IssueRow[]

  const activityItem = (a: ActivityRow, overdue: boolean): WorkItem => ({
    id: `activity-${a.id}`,
    href: `/projects/${a.project_id}/schedule`,
    title: a.name,
    project: a.projects ? `${a.projects.project_number} · ${a.projects.name}` : null,
    status: ACTIVITY_STATUS_LABELS[a.status],
    meta: a.planned_end
      ? `${overdue ? 'Was due' : 'Due'} ${formatDate(a.planned_end)}`
      : a.planned_start
        ? `Starts ${formatDate(a.planned_start)}`
        : 'No date scheduled',
    tone: overdue ? 'attention' : 'default',
  })

  const attentionItems: WorkItem[] = [
    ...attention.map((a) => activityItem(a, true)),
    ...issues.map<WorkItem>((i) => ({
      id: `issue-${i.id}`,
      href: `/projects/${i.project_id}/issues/${i.id}`,
      title: i.item_label,
      project: i.projects ? `${i.projects.project_number} · ${i.projects.name}` : null,
      status: ISSUE_STATUS_LABELS[i.status],
      meta: `Issue reported ${formatDate(i.reported_at)}`,
      tone: 'attention',
    })),
  ]
  const upcomingItems = upcoming.map((a) => activityItem(a, false))
  const showActivities = features.schedule
  const showAttention = features.schedule || (features.walkthroughs && features.issues)

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        icon={CalendarCheck2}
        title="My Work"
        description="Your assigned projects, upcoming activities, and items needing attention."
      />

      <section aria-labelledby="my-projects" className="flex flex-col gap-4">
        <SectionHeading
          id="my-projects"
          title="Assigned projects"
          description={projects.length ? `${projects.length} ${projects.length === 1 ? 'project' : 'projects'} you manage or are a member of` : undefined}
        />
        {projects.length ? (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {projects.map((p) => (
              <li key={p.id} className="flex">
                <CompactProjectCard
                  project={{
                    ...p,
                    completion_date: p.completion_date ?? null,
                    photoUrl: photos.get(p.id)?.url ?? null,
                    photoKind: photos.get(p.id)?.kind ?? null,
                    details: cardDetails.get(p.id)!,
                    warrantyEnabled: features.warranty,
                  }}
                />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={FolderKanban}
            title="No projects assigned yet."
            description="Projects appear here once you are set as the project manager or added to the project team."
          />
        )}
      </section>

      {(showAttention || showActivities) && (
        <div className="grid gap-6 lg:grid-cols-2">
          {showAttention && (
            <WorkItemList
              id="needs-attention"
              icon={TriangleAlert}
              title="Needs attention"
              description="Your overdue or delayed activities and open issues assigned to you."
              items={attentionItems}
              emptyText="Nothing overdue. Open issues assigned to you will appear here too."
            />
          )}
          {showActivities && (
            <WorkItemList
              id="upcoming-activities"
              icon={CalendarCheck2}
              title="Upcoming activities"
              description="Schedule activities assigned to you, soonest first."
              items={upcomingItems}
              emptyText="No upcoming activities are assigned to you."
            />
          )}
        </div>
      )}
    </div>
  )
}
