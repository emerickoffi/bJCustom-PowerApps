import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { getActionItems } from '@/lib/attention-data'
import type { ActionFeatures } from '@/lib/action-items'
import { getProfileNames } from '@/lib/queries'
import { formatDate } from '@/lib/format'
import { todayIso } from '@/lib/schedule'
import { logSourceFailure } from '@/lib/source-diagnostics'
import {
  compareActivity,
  compareAttention,
  dedupeById,
  fromActionItem,
  fromClientUpdateDraft,
  fromReceivedQuotes,
  type CommunicationItem,
} from '@/lib/project-communications'

type Supabase = Awaited<ReturnType<typeof createClient>>

export type CommFeatures = ActionFeatures & { client_updates?: boolean; daily_logs?: boolean }

export type ProjectCommunications = {
  attention: CommunicationItem[]
  activity: CommunicationItem[]
  /** A source query failed; the lists are partial and the UI says so rather than implying "all clear". */
  incomplete: boolean
  /** User-facing names of the sources that failed; details are written to server logs only. */
  failedSources: string[]
}

const ACTIVITY_PER_SOURCE = 40

/**
 * Every read runs as the signed-in user, so RLS decides what each person sees. The extra manager gates
 * mirror the Action Center: builder staff never get review prompts for drafts or private quotes.
 */
export async function loadProjectCommunications(args: {
  projectId: string
  organizationId: string
  userId: string
  manager: boolean
  features: CommFeatures
}): Promise<ProjectCommunications> {
  const { projectId, organizationId, userId, manager, features } = args
  const supabase = await createClient()
  const today = todayIso()
  const [actionData, drafts, quotes, activity] = await Promise.all([
    getActionItems(organizationId, userId, { manager, features, projectId }).catch((error: unknown) => {
      logSourceFailure('project_communications', 'Needs attention checks', error, { projectId })
      return null
    }),
    manager && features.client_updates ? loadClientUpdateDrafts(supabase, projectId) : Promise.resolve([]),
    manager && features.subcontractors ? loadReceivedQuotes(supabase, projectId) : Promise.resolve([]),
    loadActivity(supabase, projectId, { manager, features }),
  ])

  const failedSources = [
    ...(actionData ? actionData.unavailable.map((u) => u.module) : ['Needs attention checks']),
    ...(drafts === null ? ['Client update drafts'] : []),
    ...(quotes === null ? ['Quote requests'] : []),
    ...activity.failed,
  ]
  const incomplete = failedSources.length > 0

  const attention = dedupeById([
    ...(actionData?.items ?? []).flatMap((i) => fromActionItem(i, today) ?? []),
    ...(drafts ?? []).map(fromClientUpdateDraft),
    ...(quotes ?? []).map(fromReceivedQuotes),
  ]).sort(compareAttention)

  const names = await getProfileNames([...attention, ...activity.items].map((i) => i.responsibleUserId))
  const withNames = (i: CommunicationItem) =>
    i.responsibleUserId ? { ...i, responsibleName: names.get(i.responsibleUserId) ?? null } : i

  return {
    attention: attention.map(withNames),
    activity: dedupeById(activity.items).sort(compareActivity).map(withNames),
    incomplete,
    failedSources: [...new Set(failedSources)],
  }
}

async function loadClientUpdateDrafts(supabase: Supabase, projectId: string) {
  const { data, error } = await supabase
    .from('client_updates')
    .select('id, project_id, title, updated_at, created_by')
    .eq('project_id', projectId)
    .eq('status', 'draft')
    .order('updated_at', { ascending: true })
    .limit(20)
  if (error) {
    logSourceFailure('project_communications', 'Client update drafts', error, { projectId })
    return null
  }
  return (data ?? []).map((d) => ({
    id: d.id as string,
    projectId: d.project_id as string,
    title: d.title as string,
    updatedAt: d.updated_at as string,
    createdBy: (d.created_by as string | null) ?? null,
  }))
}

/** Open requests that have submitted responses and no award. Selects ids and timestamps only, never amounts. */
async function loadReceivedQuotes(supabase: Supabase, projectId: string) {
  const { data: requests, error } = await supabase
    .from('subcontract_quote_requests')
    .select('id, project_id, title')
    .eq('project_id', projectId)
    .eq('status', 'open')
    .limit(30)
  if (error) {
    logSourceFailure('project_communications', 'Quote requests', error, { projectId })
    return null
  }
  if (!requests?.length) return []
  const ids = requests.map((r) => r.id as string)
  const [revRes, awardRes] = await Promise.all([
    supabase.from('subcontract_quote_revisions').select('request_id, submitted_at').in('request_id', ids).eq('status', 'submitted'),
    supabase.from('subcontract_quote_awards').select('request_id').in('request_id', ids),
  ])
  if (revRes.error || awardRes.error) {
    logSourceFailure('project_communications', 'Quote requests', revRes.error ?? awardRes.error, { projectId })
    return null
  }
  const awarded = new Set((awardRes.data ?? []).map((a) => a.request_id as string))
  const byRequest = new Map<string, { count: number; latest: string }>()
  for (const r of revRes.data ?? []) {
    const id = r.request_id as string
    const at = (r.submitted_at as string) ?? ''
    const cur = byRequest.get(id)
    byRequest.set(id, { count: (cur?.count ?? 0) + 1, latest: cur && cur.latest > at ? cur.latest : at })
  }
  return requests.flatMap((r) => {
    const agg = byRequest.get(r.id as string)
    if (!agg || awarded.has(r.id as string)) return []
    return [{ requestId: r.id as string, projectId: r.project_id as string, title: r.title as string, submittedCount: agg.count, latestAt: agg.latest }]
  })
}

function event(
  e: Omit<CommunicationItem, 'dateLabel' | 'context' | 'responsibleName' | 'overdue'> & { context?: string | null },
): CommunicationItem {
  return { dateLabel: null, responsibleName: null, overdue: false, ...e, context: e.context ?? null }
}

async function loadActivity(
  supabase: Supabase,
  projectId: string,
  { manager, features }: { manager: boolean; features: CommFeatures },
): Promise<{ items: CommunicationItem[]; failed: string[] }> {
  const pid = encodeURIComponent(projectId)
  const none = Promise.resolve({ data: [] as Record<string, unknown>[], error: null })
  const [rfis, issues, updates, logs, revisions] = await Promise.all([
    features.rfis
      ? supabase
          .from('project_rfis')
          .select('id, rfi_number, subject, status, sent_at, answered_at, closed_at')
          .eq('project_id', projectId)
          .not('sent_at', 'is', null)
          .order('sent_at', { ascending: false })
          .limit(ACTIVITY_PER_SOURCE)
      : none,
    features.issues
      ? supabase
          .from('project_issues')
          .select('id, item_label, status, reported_at, responsible_user_id')
          .eq('project_id', projectId)
          .order('reported_at', { ascending: false })
          .limit(ACTIVITY_PER_SOURCE)
      : none,
    features.client_updates
      ? supabase
          .from('client_updates')
          .select('id, title, last_published_at, last_published_by')
          .eq('project_id', projectId)
          .eq('status', 'published')
          .order('last_published_at', { ascending: false })
          .limit(ACTIVITY_PER_SOURCE)
      : none,
    features.daily_logs
      ? supabase
          .from('daily_logs')
          .select('id, log_date, status, author_id')
          .eq('project_id', projectId)
          .eq('status', 'finalized')
          .order('log_date', { ascending: false })
          .limit(ACTIVITY_PER_SOURCE)
      : none,
    manager && features.subcontractors
      ? supabase
          .from('subcontract_quote_revisions')
          .select('id, request_id, revision_number, submitted_at, subcontract_quote_requests!inner(title, project_id)')
          .eq('subcontract_quote_requests.project_id', projectId)
          .eq('status', 'submitted')
          .order('submitted_at', { ascending: false })
          .limit(ACTIVITY_PER_SOURCE)
      : none,
  ])

  const failed: string[] = []
  for (const [source, res] of [
    ['Questions (RFIs)', rfis],
    ['Punch List', issues],
    ['Client updates', updates],
    ['Daily Logs', logs],
    ['Quote requests', revisions],
  ] as const) {
    if (!res.error) continue
    logSourceFailure('project_communications', source, res.error, { projectId })
    failed.push(source)
  }
  const items: CommunicationItem[] = []

  for (const r of (rfis.data ?? []) as Record<string, string | number | null>[]) {
    const href = `/projects/${pid}/rfis?rfi=${encodeURIComponent(String(r.id))}`
    const title = `Q-${r.rfi_number} ${r.subject}`
    if (r.sent_at) items.push(event({ id: `rfi:${r.id}:sent`, type: 'rfi', title, status: 'Question sent', date: String(r.sent_at), responsibleUserId: null, href, actionLabel: 'Open Question' }))
    if (r.answered_at) items.push(event({ id: `rfi:${r.id}:answered`, type: 'rfi', title, status: 'Answer recorded', date: String(r.answered_at), responsibleUserId: null, href, actionLabel: 'Open Question' }))
    if (r.closed_at) items.push(event({ id: `rfi:${r.id}:closed`, type: 'rfi', title, status: 'Question closed', date: String(r.closed_at), responsibleUserId: null, href, actionLabel: 'Open Question' }))
  }
  for (const i of (issues.data ?? []) as Record<string, string | null>[]) {
    items.push(
      event({
        id: `issue:${i.id}:reported`,
        type: 'issue',
        title: i.item_label ?? 'Issue',
        status: `Issue reported · now ${String(i.status ?? '').replaceAll('_', ' ')}`,
        date: i.reported_at,
        responsibleUserId: i.responsible_user_id,
        href: `/projects/${pid}/issues/${encodeURIComponent(String(i.id))}`,
        actionLabel: 'Open Issue',
      }),
    )
  }
  for (const u of (updates.data ?? []) as Record<string, string | null>[]) {
    items.push(
      event({
        id: `client_update:${u.id}:published`,
        type: 'client_update',
        title: u.title ?? 'Client update',
        status: 'Published to homeowners',
        date: u.last_published_at,
        responsibleUserId: u.last_published_by,
        href: `/projects/${pid}/client-updates/${encodeURIComponent(String(u.id))}`,
        actionLabel: 'View Update',
      }),
    )
  }
  for (const l of (logs.data ?? []) as Record<string, string | null>[]) {
    items.push(
      event({
        id: `daily_log:${l.id}:finalized`,
        type: 'daily_log',
        title: `Daily log for ${formatDate(l.log_date)}`,
        status: 'Daily log finalized',
        date: l.log_date,
        responsibleUserId: l.author_id,
        href: `/projects/${pid}/daily-logs/${encodeURIComponent(String(l.id))}`,
        actionLabel: 'Open Log',
      }),
    )
  }
  for (const r of (revisions.data ?? []) as unknown as {
    id: string
    request_id: string
    revision_number: number
    submitted_at: string | null
    subcontract_quote_requests: { title: string } | { title: string }[] | null
  }[]) {
    const req = Array.isArray(r.subcontract_quote_requests) ? r.subcontract_quote_requests[0] : r.subcontract_quote_requests
    items.push(
      event({
        id: `quote_revision:${r.id}:submitted`,
        type: 'quote',
        title: req?.title ?? 'Quote request',
        status: r.revision_number > 1 ? `Revised quote received (revision ${r.revision_number})` : 'Quote received',
        date: r.submitted_at,
        responsibleUserId: null,
        href: `/projects/${pid}/subcontractor-work/quotes/${encodeURIComponent(r.request_id)}`,
        actionLabel: 'Review Quotes',
      }),
    )
  }

  return { items, failed }
}
