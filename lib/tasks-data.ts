import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { sortOpenTasks, type StaffTask } from '@/lib/tasks'

const OPEN_FETCH_LIMIT = 500
const COMPLETED_FETCH_LIMIT = 20
const TASK_COLUMNS = 'id, title, project_id, due_date, completed_at, created_at, projects(name)'

type TaskRow = {
  id: string
  title: string
  project_id: string | null
  due_date: string | null
  completed_at: string | null
  created_at: string
  projects: { name: string } | null
}

export type MyTasks =
  | { state: 'available'; open: StaffTask[]; openCount: number; overdueCount: number; completed: StaffTask[] }
  | { state: 'unavailable' }

function toTask(row: TaskRow): StaffTask {
  return {
    id: row.id,
    title: row.title,
    projectId: row.project_id,
    projectName: row.projects?.name ?? null,
    dueDate: row.due_date,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  }
}

/**
 * The signed-in user's to-dos. Row level security limits results to tasks assigned to this user whose linked
 * project (if any) they can still view, so the count and list follow the same project permissions.
 */
export async function loadMyTasks(orgId: string, userId: string, today: string): Promise<MyTasks> {
  const supabase = await createClient()
  const [openRes, overdueRes, completedRes] = await Promise.all([
    supabase
      .from('staff_tasks')
      .select(TASK_COLUMNS, { count: 'exact' })
      .eq('organization_id', orgId)
      .eq('assigned_to', userId)
      .is('completed_at', null)
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
      .limit(OPEN_FETCH_LIMIT),
    supabase
      .from('staff_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('assigned_to', userId)
      .is('completed_at', null)
      .lt('due_date', today),
    supabase
      .from('staff_tasks')
      .select(TASK_COLUMNS)
      .eq('organization_id', orgId)
      .eq('assigned_to', userId)
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(COMPLETED_FETCH_LIMIT),
  ])
  if (openRes.error || overdueRes.error || completedRes.error) {
    console.error('[tasks] load failed', openRes.error ?? overdueRes.error ?? completedRes.error)
    return { state: 'unavailable' }
  }
  const open = sortOpenTasks(((openRes.data ?? []) as unknown as TaskRow[]).map(toTask), today)
  return {
    state: 'available',
    open,
    openCount: openRes.count ?? open.length,
    overdueCount: overdueRes.count ?? 0,
    completed: ((completedRes.data ?? []) as unknown as TaskRow[]).map(toTask),
  }
}
