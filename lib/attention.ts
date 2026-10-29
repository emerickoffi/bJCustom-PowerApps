export type AttentionPriority = 'critical' | 'reported' | 'pending'

export type AttentionNotification = {
  id: string
  title: string
  body: string | null
  link: string | null
  kind: string
  action_required: boolean
  dedupe_key: string | null
  created_at: string
  project_id: string | null
  projectName: string | null
}

export type AttentionActivity = {
  id: string
  project_id: string
  name: string
  status: string
  planned_end: string | null
  projectName: string | null
  /** Companies with an active assignment on this activity. */
  companies?: string[]
}

/** A Daily Log that recorded a delay. Text fields are field notes: displayed as quoted, never interpreted. */
export type AttentionDailyLogDelay = {
  id: string
  project_id: string
  projectName: string | null
  log_date: string
  delay_reason: string | null
  delay_description: string
}

export type AttentionItem = {
  key: string
  priority: AttentionPriority
  issueType: string
  title: string
  project: string | null
  description: string
  /** YYYY-MM-DD of the record that produced this item. */
  sourceDate: string | null
  href: string
  actionLabel: string
  sortAt: string
}

type FeatureFlags = {
  schedule: boolean
  warranty: boolean
  documents: boolean
  e_signatures: boolean
  daily_logs?: boolean
  subcontractors?: boolean
}

function clip(text: string, max = 140): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat
}

function joinNames(names: string[]): string {
  if (names.length <= 2) return names.join(' and ')
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`
}

const WARRANTY_KINDS = new Set(['warranty_claim', 'warranty_milestone', 'warranty_reminder', 'anniversary_card'])

export function isSignatureDeclined(n: Pick<AttentionNotification, 'kind' | 'dedupe_key'>): boolean {
  return n.kind === 'signature_request' && !!n.dedupe_key?.endsWith(':declined')
}

/** A notification is a pending task only when the workflow flagged it as such; everything else is an update. */
export function isActionableNotification(n: Pick<AttentionNotification, 'kind' | 'dedupe_key' | 'action_required'>): boolean {
  return n.action_required || isSignatureDeclined(n)
}

export function notificationFeatureEnabled(kind: string, features: FeatureFlags): boolean {
  if (WARRANTY_KINDS.has(kind)) return features.warranty
  if (kind === 'signature_request') return features.documents && features.e_signatures
  return true
}

function actionLabelFor(n: AttentionNotification): string {
  if (n.kind === 'warranty_claim') return 'Review claim'
  if (WARRANTY_KINDS.has(n.kind)) return 'Open warranty'
  if (n.kind === 'signature_request') return 'Review document'
  return 'Open'
}

/**
 * Builds the ordered Command Center list from verified records only:
 * overdue or delayed schedule work, then delays reported in Daily Logs, then flagged notifications.
 */
export function buildAttentionItems(
  notifications: AttentionNotification[],
  activities: AttentionActivity[],
  features: FeatureFlags,
  today: string,
  logDelays: AttentionDailyLogDelay[] = [],
): AttentionItem[] {
  const critical: AttentionItem[] = features.schedule
    ? activities.map((a) => {
        const overdue = !!a.planned_end && a.planned_end < today
        const companies = features.subcontractors ? (a.companies ?? []) : []
        const base =
          a.status === 'delayed'
            ? 'Marked delayed on the construction schedule. Update the plan or status.'
            : 'Still open after its planned finish date. Update progress or reschedule.'
        return {
          key: `a-${a.id}`,
          priority: 'critical' as const,
          issueType: companies.length > 0 ? 'Assigned work' : 'Schedule',
          title: a.status === 'delayed' ? `${a.name} is delayed` : `${a.name} is past its planned finish`,
          project: a.projectName,
          description: companies.length > 0 ? `${base} Assigned to ${joinNames(companies)}.` : base,
          sourceDate: a.planned_end,
          href: `/projects/${a.project_id}/schedule`,
          actionLabel: 'View schedule',
          sortAt: overdue ? (a.planned_end as string) : today,
        }
      })
    : []
  critical.sort((x, y) => x.sortAt.localeCompare(y.sortAt))

  const reported: AttentionItem[] = features.daily_logs
    ? logDelays.map((l) => ({
        key: `d-${l.id}`,
        priority: 'reported' as const,
        issueType: 'Daily Log',
        title: 'Delay reported in the Daily Log',
        project: l.projectName,
        description: `Field note: “${clip(l.delay_reason || l.delay_description)}”`,
        sourceDate: l.log_date,
        href: `/projects/${l.project_id}/daily-logs/${l.id}`,
        actionLabel: 'Open log',
        sortAt: l.log_date,
      }))
    : []
  reported.sort((x, y) => y.sortAt.localeCompare(x.sortAt))

  const pending: AttentionItem[] = notifications
    .filter((n) => isActionableNotification(n) && notificationFeatureEnabled(n.kind, features))
    .map((n) => ({
      key: `n-${n.id}`,
      priority: 'pending' as const,
      issueType: WARRANTY_KINDS.has(n.kind) ? 'Warranty' : n.kind === 'signature_request' ? 'Documents' : 'Task',
      title: n.title,
      project: n.projectName,
      description: n.body ?? '',
      sourceDate: n.created_at.slice(0, 10),
      href: n.link ?? (n.project_id ? `/projects/${n.project_id}` : '/dashboard'),
      actionLabel: actionLabelFor(n),
      sortAt: n.created_at,
    }))
  pending.sort((x, y) => y.sortAt.localeCompare(x.sortAt))

  return [...critical, ...reported, ...pending]
}

/** Unread notifications that are not pending tasks, for Recent Activity. */
export function informationalNotifications(notifications: AttentionNotification[], features: FeatureFlags): AttentionNotification[] {
  return notifications.filter((n) => !isActionableNotification(n) && notificationFeatureEnabled(n.kind, features))
}
