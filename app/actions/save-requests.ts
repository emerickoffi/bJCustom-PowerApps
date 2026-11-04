'use server'

import { z } from 'zod'
import { getSession } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { findCommittedSave } from '@/lib/save-requests-server'
import { dailyLogPath } from '@/lib/daily-logs'
import { changeOrderPath } from '@/lib/change-orders'
import type { SaveKind } from '@/lib/save-requests'

export type ReconcileResult =
  | { status: 'committed'; href: string }
  | { status: 'not_found' }
  | { status: 'unsupported' }
  | { status: 'auth' }

const Input = z.object({ kind: z.enum(['daily_log', 'change_order', 'estimate']), requestId: z.uuid(), expectedUser: z.uuid().optional() })

/** Answers "did my earlier save commit?" for the signed-in user only. RLS limits the ledger to own rows. */
export async function reconcileSaveRequestAction(input: { kind: SaveKind; requestId: string; expectedUser?: string }): Promise<ReconcileResult> {
  const parsed = Input.safeParse(input)
  if (!parsed.success) return { status: 'not_found' }
  const session = await getSession()
  if (!session || !session.organizationId) return { status: 'auth' }
  if (parsed.data.expectedUser && parsed.data.expectedUser !== session.userId) return { status: 'auth' }

  const supabase = await createClient()
  const recordId = await findCommittedSave(supabase, parsed.data.requestId, parsed.data.kind)
  if (recordId === 'unavailable') return { status: 'unsupported' }
  if (!recordId) return { status: 'not_found' }

  if (parsed.data.kind === 'estimate') return { status: 'committed', href: `/estimates/${recordId}` }
  const table = parsed.data.kind === 'daily_log' ? 'daily_logs' : 'change_orders'
  const { data } = await supabase.from(table).select('project_id').eq('id', recordId).maybeSingle()
  if (!data) return { status: 'not_found' }
  const href = parsed.data.kind === 'daily_log' ? dailyLogPath(data.project_id, recordId) : changeOrderPath(data.project_id, recordId)
  return { status: 'committed', href }
}
