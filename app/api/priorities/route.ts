import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { getSession, canManage } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/subcontractor-projects'
import { getActionItems } from '@/lib/attention-data'
import { loadAgenda } from '@/lib/dashboard-workspace-data'
import { loadMyTasks } from '@/lib/tasks-data'
import { readWorkScope } from '@/lib/dashboard-prefs'
import {
  assembleBriefing,
  generateBriefingSummaries,
  loadOverdueQuoteRequests,
  priorityAiAvailable,
} from '@/lib/ai/daily-priorities-server'
import { UPCOMING_DAYS, scopeKey, uncheckedSources } from '@/lib/daily-priorities'

export const maxDuration = 30

const NO_STORE = { 'Cache-Control': 'no-store' }

const bodySchema = z.object({
  mode: z.enum(['auto', 'manual']),
  projectId: z.string().nullable().optional(),
})

function fail(status: number, message: string) {
  return NextResponse.json({ error: message }, { status, headers: NO_STORE })
}

/**
 * Re-ranks from live, RLS-filtered records on every call. Only then, and only when the facts changed or
 * the user asked, does it spend a model call to reword the already-chosen items.
 */
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session?.userId || !session.organizationId) return fail(401, 'Sign in to see your priorities.')
  if (!session.role || session.role === 'client') return fail(403, 'Priorities are available to staff only.')

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return fail(400, 'Invalid request.')
  const { mode } = parsed.data
  const orgId = session.organizationId

  let projectId: string | null = null
  if (parsed.data.projectId) {
    if (!isUuid(parsed.data.projectId)) return fail(400, 'Invalid project.')
    const supabase = await createClient()
    const { data } = await supabase
      .from('projects')
      .select('id')
      .eq('id', parsed.data.projectId)
      .eq('organization_id', orgId)
      .maybeSingle()
    if (!data) return fail(404, 'Project not found.')
    projectId = data.id as string
  }

  const features = await getOrgFeatures(orgId)
  const manager = canManage(session.role)
  const agenda = await loadAgenda(orgId, features.schedule, UPCOMING_DAYS + 1)
  const [actions, tasks, quoteRequests, scope] = await Promise.all([
    getActionItems(orgId, session.userId, { manager, features }),
    loadMyTasks(orgId, session.userId, agenda.today),
    loadOverdueQuoteRequests(orgId, Boolean(features.subcontractors)),
    readWorkScope(session.userId),
  ])

  const aiAvailable = priorityAiAvailable(features)
  const ctx = {
    orgId,
    userId: session.userId,
    manager,
    today: agenda.today,
    scope,
    projectId,
    inputs: {
      actionItems: actions.items,
      tasks: tasks.state === 'available' ? tasks.open : [],
      activities: agenda.activities,
      quoteRequests: quoteRequests ?? [],
    },
    unchecked: uncheckedSources({
      modules: actions.unavailable.map((u) => u.module),
      tasksFailed: tasks.state === 'unavailable',
      agendaFailed: !!agenda.failed,
      quotesFailed: quoteRequests === null,
    }),
  }

  const first = await assembleBriefing({ ...ctx, aiAvailable })
  const { briefing, top } = first
  const upToDate = briefing.state === 'ready' || (briefing.state === 'fallback' && aiAvailable)
  if (!aiAvailable || top.length === 0 || (mode === 'auto' && upToDate)) {
    return NextResponse.json({ briefing }, { headers: NO_STORE })
  }

  const result = await generateBriefingSummaries({
    orgId,
    userId: session.userId,
    key: scopeKey(scope, projectId),
    mode,
    top,
    fingerprint: briefing.fingerprint,
  })
  const notice = result.kind === 'skipped' ? result.notice : null
  const final = await assembleBriefing({ ...ctx, aiAvailable, notice })
  return NextResponse.json({ briefing: final.briefing }, { headers: NO_STORE })
}
