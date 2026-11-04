'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { canManage, getSession } from '@/lib/session'
import { friendlyDbError } from '@/lib/action-state'
import { EDITABLE_ESTIMATE_STATUSES, type EstimateStatus } from '@/lib/estimates'
import {
  describeTitleRequestError,
  titleEditEligibility,
  titleEditRequestSchema,
  type TitleEditResult,
} from '@/lib/estimate-title'

type Row = {
  id: string
  name: string
  status: EstimateStatus
  family_id: string
  revision: number
  project_id: string
  updated_at: string
}

/**
 * Inline grid title save. Authorization, workspace, eligibility and version are all
 * re-derived server-side; the write itself is conditional on version + editable status,
 * and RLS (is_org_manager), the lock trigger and the audit trigger still apply.
 */
export async function updateEstimateTitleAction(input: unknown): Promise<TitleEditResult> {
  const parsed = titleEditRequestSchema.safeParse(input)
  if (!parsed.success) return { ok: false, code: 'invalid', message: describeTitleRequestError(parsed.error).message }
  const req = parsed.data

  const session = await getSession()
  if (!session?.organizationId || !session.role) {
    return { ok: false, code: 'forbidden', message: 'Your session ended. Sign in again, then save.' }
  }
  if (session.organizationId !== req.organizationId) {
    return {
      ok: false,
      code: 'workspace',
      message: 'You switched workspaces. Reload this page; the change was not saved to the other company.',
    }
  }
  if (!canManage(session.role)) {
    return { ok: false, code: 'forbidden', message: 'You do not have permission to edit estimates.' }
  }

  const supabase = await createClient()
  const load = async () => {
    const { data } = await supabase
      .from('estimates')
      .select('id, name, status, family_id, revision, project_id, updated_at')
      .eq('id', req.estimateId)
      .eq('organization_id', session.organizationId)
      .maybeSingle<Row>()
    return data
  }

  const row = await load()
  if (!row) return { ok: false, code: 'not_found', message: 'Estimate not found.' }

  const { count: newer } = await supabase
    .from('estimates')
    .select('id', { count: 'exact', head: true })
    .eq('family_id', row.family_id)
    .gt('revision', row.revision)
  const eligibility = titleEditEligibility({ canManage: true, status: row.status, isLatest: !newer })
  if (!eligibility.editable) {
    return { ok: false, code: 'locked', message: eligibility.reason, current: { name: row.name, updatedAt: row.updated_at } }
  }
  if (row.updated_at !== req.expectedUpdatedAt) {
    return {
      ok: false,
      code: 'conflict',
      message: 'This estimate changed since you opened it.',
      current: { name: row.name, updatedAt: row.updated_at },
    }
  }
  if (row.name === req.name) return { ok: true, name: row.name, updatedAt: row.updated_at, unchanged: true }

  const { data: saved, error } = await supabase
    .from('estimates')
    .update({ name: req.name, updated_by: session.userId })
    .eq('id', req.estimateId)
    .eq('organization_id', session.organizationId)
    .eq('updated_at', req.expectedUpdatedAt)
    .in('status', EDITABLE_ESTIMATE_STATUSES)
    .select('name, updated_at')
    .maybeSingle<{ name: string; updated_at: string }>()
  if (error) return { ok: false, code: 'error', message: friendlyDbError(error) }

  if (!saved) {
    const latest = await load()
    if (!latest) return { ok: false, code: 'not_found', message: 'Estimate not found.' }
    const current = { name: latest.name, updatedAt: latest.updated_at }
    if (!EDITABLE_ESTIMATE_STATUSES.includes(latest.status)) {
      return { ok: false, code: 'locked', message: 'This estimate was locked before your change saved.', current }
    }
    return { ok: false, code: 'conflict', message: 'This estimate changed since you opened it.', current }
  }

  revalidatePath('/estimates')
  revalidatePath(`/estimates/${req.estimateId}`)
  revalidatePath(`/projects/${row.project_id}`)
  return { ok: true, name: saved.name, updatedAt: saved.updated_at }
}
