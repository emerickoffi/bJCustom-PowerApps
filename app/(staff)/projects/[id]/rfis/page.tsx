import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { z } from 'zod'
import { requireStaff } from '@/lib/session'
import { requireFeature } from '@/lib/features'
import { createClient } from '@/lib/supabase/server'
import { sanitizeSearch } from '@/lib/format'
import { todayIso } from '@/lib/schedule'
import {
  RFI_LIST_COLUMNS,
  RFI_PAGE_SIZE,
  isRfiPriority,
  isRfiStatus,
  parseRfiNumber,
  type RfiListRow,
  type RfiScope,
  type RfiSort,
} from '@/lib/rfis'
import { RfiWorkspace } from '@/components/rfis/rfi-workspace'

export const metadata: Metadata = { title: 'Questions (RFIs)' }

type SearchParams = { q?: string; status?: string; priority?: string; scope?: string; sort?: string; page?: string }

export default async function ProjectRfisPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<SearchParams>
}) {
  const session = await requireStaff()
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  await requireFeature(session.organizationId, 'rfis', `/projects/${id}`)
  const sp = await searchParams
  const supabase = await createClient()

  const [{ data: project }, { data: internal }] = await Promise.all([
    supabase.from('projects').select('id, name, archived_at').eq('id', id).eq('organization_id', session.organizationId).maybeSingle(),
    supabase.rpc('can_view_project_internal', { p_project: id }),
  ])
  // Same rule the database applies to asking: builder staff with internal access to this project.
  if (!project || !internal) notFound()

  const q = sanitizeSearch(sp.q)
  const status = isRfiStatus(sp.status) ? sp.status : ''
  const scope: RfiScope = sp.scope === 'mine' ? 'mine' : 'all'
  const priority = isRfiPriority(sp.priority) ? sp.priority : ''
  const sort: RfiSort = sp.sort === 'priority' ? 'priority' : 'number'
  const page = Math.max(1, Math.floor(Number(sp.page)) || 1)
  const from = (page - 1) * RFI_PAGE_SIZE

  // Row-level security returns only what this person may see: sent questions on the project, plus their own drafts
  // (all drafts for managers).
  let query = supabase.from('project_rfis').select(RFI_LIST_COLUMNS, { count: 'exact' }).eq('project_id', id)
  if (status) query = query.eq('status', status)
  if (priority) query = query.eq('priority', priority)
  if (scope === 'mine') query = query.eq('responder_user_id', session.userId)
  if (q) {
    const number = parseRfiNumber(q)
    query = number ? query.or(`rfi_number.eq.${number},subject.ilike.%${q}%`) : query.ilike('subject', `%${q}%`)
  }
  if (sort === 'priority') {
    query = query.order('priority_rank', { ascending: false }).order('due_date', { ascending: true, nullsFirst: false })
  }
  const { data, error, count } = await query
    .order('rfi_number', { ascending: false, nullsFirst: true })
    .order('updated_at', { ascending: false })
    .range(from, from + RFI_PAGE_SIZE - 1)

  const total = count ?? 0
  return (
    <RfiWorkspace
      projectId={project.id}
      projectName={project.name}
      rows={(data ?? []) as unknown as RfiListRow[]}
      total={total}
      page={page}
      pageCount={Math.max(1, Math.ceil(total / RFI_PAGE_SIZE))}
      filters={{ q, status, priority, scope, sort }}
      loaded={!error}
      canAsk={!project.archived_at}
      today={todayIso()}
    />
  )
}
