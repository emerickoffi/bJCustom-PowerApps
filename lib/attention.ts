export type AttentionPriority = 'critical' | 'pending'

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
}

export type AttentionItem = {
  key: string
  priority: AttentionPriority
  title: string
  project: string | null
  description: string
  href: string
  actionLabel: string
  sortAt: string
}

type FeatureFlags = { schedule: boolean; warranty: boolean; documents: boolean; e_signatures: boolean }

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

/** Builds the ordered pending list: overdue or delayed schedule work first, then flagged notifications, newest first. */
export function buildAttentionItems(
  notifications: AttentionNotification[],
  activities: AttentionActivity[],
  features: FeatureFlags,
  today: string,
): AttentionItem[] {
  const critical: AttentionItem[] = features.schedule
    ? activities.map((a) => {
        const overdue = !!a.planned_end && a.planned_end < today
        return {
          key: `a-${a.id}`,
          priority: 'critical' as const,
          title: a.status === 'delayed' ? `${a.name} is delayed` : `${a.name} is past its planned finish`,
          project: a.projectName,
          description:
            a.status === 'delayed'
              ? 'Marked delayed on the construction schedule. Update the plan or status.'
              : 'Still open after its planned finish date. Update progress or reschedule.',
          href: `/projects/${a.project_id}/schedule`,
          actionLabel: 'View schedule',
          sortAt: overdue ? (a.planned_end as string) : today,
        }
      })
    : []
  critical.sort((x, y) => x.sortAt.localeCompare(y.sortAt))

  const pending: AttentionItem[] = notifications
    .filter((n) => isActionableNotification(n) && notificationFeatureEnabled(n.kind, features))
    .map((n) => ({
      key: `n-${n.id}`,
      priority: 'pending' as const,
      title: n.title,
      project: n.projectName,
      description: n.body ?? '',
      href: n.link ?? (n.project_id ? `/projects/${n.project_id}` : '/dashboard'),
      actionLabel: actionLabelFor(n),
      sortAt: n.created_at,
    }))
  pending.sort((x, y) => y.sortAt.localeCompare(x.sortAt))

  return [...critical, ...pending]
}

/** Unread notifications that are not pending tasks, for Recent Activity. */
export function informationalNotifications(notifications: AttentionNotification[], features: FeatureFlags): AttentionNotification[] {
  return notifications.filter((n) => !isActionableNotification(n) && notificationFeatureEnabled(n.kind, features))
}
