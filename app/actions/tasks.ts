'use server'

import { revalidatePath } from 'next/cache'
import { requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { isTaskId, parseTaskInput } from '@/lib/tasks'

export type TaskActionResult = { ok: true } | { ok: false; error: string }

/** Creates a to-do assigned to the signed-in user. RLS re-checks staff role and project access on insert. */
export async function createTaskAction(raw: {
  title?: unknown
  projectId?: unknown
  dueDate?: unknown
}): Promise<TaskActionResult> {
  const session = await requireStaff()
  const parsed = parseTaskInput(raw)
  if ('error' in parsed) return { ok: false, error: parsed.error }
  const supabase = await createClient()
  const { error } = await supabase.from('staff_tasks').insert({
    organization_id: session.organizationId,
    title: parsed.input.title,
    project_id: parsed.input.projectId,
    due_date: parsed.input.dueDate,
    assigned_to: session.userId,
    created_by: session.userId,
  })
  if (error) {
    console.error('[tasks] create failed', error)
    return {
      ok: false,
      error: error.code === '42501' ? 'You can only link projects you have access to.' : 'Could not add the task.',
    }
  }
  revalidatePath('/dashboard')
  return { ok: true }
}

/** Marks one of the signed-in user's tasks complete or open again. */
export async function setTaskCompletedAction(taskId: unknown, completed: unknown): Promise<TaskActionResult> {
  const session = await requireStaff()
  if (!isTaskId(taskId) || typeof completed !== 'boolean') return { ok: false, error: 'Invalid task.' }
  const supabase = await createClient()
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('staff_tasks')
    .update({
      completed_at: completed ? now : null,
      completed_by: completed ? session.userId : null,
      updated_at: now,
    })
    .eq('id', taskId)
    .eq('organization_id', session.organizationId)
    .eq('assigned_to', session.userId)
    .select('id')
  if (error || !data?.length) {
    if (error) console.error('[tasks] completion update failed', error)
    return { ok: false, error: 'Could not update the task.' }
  }
  revalidatePath('/dashboard')
  return { ok: true }
}
