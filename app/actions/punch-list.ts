'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'
import { friendlyDbError } from '@/lib/action-state'
import { BULK_LIMIT } from '@/lib/punch-list'

const bulkSchema = z.object({
  projectId: z.uuid(),
  walkthroughId: z.uuid(),
  items: z
    .array(z.object({ id: z.uuid(), updatedAt: z.string().min(1) }))
    .min(1, 'Select at least one issue')
    .max(BULK_LIMIT, `Select ${BULK_LIMIT} issues or fewer at a time`),
  changes: z
    .object({
      status: z.enum(['open', 'in_progress', 'resolved']).optional(),
      priority: z.enum(['low', 'normal', 'high', 'critical']).optional(),
      due_date: z.iso.date().nullable().optional(),
      responsible_user_id: z.uuid().nullable().optional(),
    })
    .refine((c) => Object.keys(c).length > 0, 'Choose at least one change'),
  atomic: z.boolean(),
})

export type BulkItemResult = { id: string; ok: boolean; error?: string; updatedAt?: string }
export type BulkUpdateResult = { error?: string; results?: BulkItemResult[]; rolledBack?: boolean }

export async function bulkUpdateIssuesAction(input: z.input<typeof bulkSchema>): Promise<BulkUpdateResult> {
  const session = await getSession()
  if (!session) return { error: 'Your session expired. Sign in again and retry.' }
  if (session.role === 'client') return { error: 'You do not have permission to update issues.' }

  const parsed = bulkSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid bulk update.' }
  const { projectId, walkthroughId, items, changes, atomic } = parsed.data

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('bulk_update_issues', {
    p_items: items.map((i) => ({ id: i.id, updated_at: i.updatedAt })),
    p_changes: changes,
    p_atomic: atomic,
  })

  if (error) {
    if (error.message?.startsWith('BULK_ROLLBACK:')) {
      try {
        const raw = JSON.parse(error.message.slice('BULK_ROLLBACK:'.length)) as { id: string; ok: boolean; error?: string }[]
        return {
          rolledBack: true,
          results: raw.map((r) => (r.ok ? { id: r.id, ok: false, error: 'Not saved because another item failed.' } : r)),
        }
      } catch {
        return { error: 'No changes were saved because at least one issue could not be updated.' }
      }
    }
    if (error.code === 'PGRST202') return { error: 'Bulk editing needs the latest database update. Ask an administrator to apply it.' }
    return { error: friendlyDbError(error) }
  }

  const results = ((data ?? []) as { id: string; ok: boolean; error?: string; updated_at?: string }[]).map((r) => ({
    id: r.id,
    ok: r.ok,
    error: r.error,
    updatedAt: r.updated_at,
  }))
  if (results.some((r) => r.ok)) {
    revalidatePath(`/projects/${projectId}/walkthroughs/${walkthroughId}`)
    revalidatePath(`/projects/${projectId}`)
  }
  return { results }
}
