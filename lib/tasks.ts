export const TASK_TITLE_MAX = 200
export const TASK_PREVIEW_LIMIT = 3

export type StaffTask = {
  id: string
  title: string
  projectId: string | null
  projectName: string | null
  dueDate: string | null
  completedAt: string | null
  createdAt: string
}

export type TaskUrgency = 'overdue' | 'today' | 'upcoming' | 'undated'

const URGENCY_RANK: Record<TaskUrgency, number> = { overdue: 0, today: 1, upcoming: 2, undated: 3 }

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Dates are org-zone calendar dates (YYYY-MM-DD), so plain string comparison orders them. */
export function taskUrgency(dueDate: string | null, today: string): TaskUrgency {
  if (!dueDate) return 'undated'
  if (dueDate < today) return 'overdue'
  if (dueDate === today) return 'today'
  return 'upcoming'
}

/** Overdue first, then due today, then future dates, then undated; earliest date and oldest task break ties. */
export function sortOpenTasks<T extends Pick<StaffTask, 'dueDate' | 'createdAt'>>(tasks: T[], today: string): T[] {
  return [...tasks].sort((a, b) => {
    const rank = URGENCY_RANK[taskUrgency(a.dueDate, today)] - URGENCY_RANK[taskUrgency(b.dueDate, today)]
    if (rank !== 0) return rank
    if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1
    return a.createdAt.localeCompare(b.createdAt)
  })
}

export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

export type TaskInput = { title: string; projectId: string | null; dueDate: string | null }

export function parseTaskInput(raw: {
  title?: unknown
  projectId?: unknown
  dueDate?: unknown
}): { input: TaskInput } | { error: string } {
  const title = typeof raw.title === 'string' ? raw.title.trim().replace(/\s+/g, ' ') : ''
  if (!title) return { error: 'Enter a task title.' }
  if (title.length > TASK_TITLE_MAX) return { error: `Keep the title under ${TASK_TITLE_MAX} characters.` }
  const projectId = typeof raw.projectId === 'string' && raw.projectId ? raw.projectId : null
  if (projectId && !UUID.test(projectId)) return { error: 'Choose a valid project.' }
  const dueDate = typeof raw.dueDate === 'string' && raw.dueDate ? raw.dueDate : null
  if (dueDate && !isValidIsoDate(dueDate)) return { error: 'Enter a valid due date.' }
  return { input: { title, projectId, dueDate } }
}

export function isTaskId(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

/** Short due label relative to the org's today, e.g. "Overdue · Nov 3", "Today", "Nov 14". */
export function formatTaskDue(dueDate: string, today: string): string {
  const [y, m, d] = dueDate.split('-').map(Number)
  const sameYear = dueDate.slice(0, 4) === today.slice(0, 4)
  const label = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)))
  const urgency = taskUrgency(dueDate, today)
  if (urgency === 'today') return 'Today'
  if (urgency === 'overdue') return `Overdue · ${label}`
  return label
}
