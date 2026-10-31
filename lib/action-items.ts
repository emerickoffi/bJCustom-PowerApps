import {
  isActionableNotification,
  notificationFeatureEnabled,
  type AttentionActivity,
  type AttentionDailyLogDelay,
  type AttentionNotification,
} from './attention.ts'
import type { QualificationAttention } from './subcontractor-qualification.ts'

export const ACTION_CATEGORIES = [
  'approvals',
  'schedule',
  'financial',
  'documents',
  'client_data',
  'compliance',
  'punch_list',
  'warranty',
  'setup',
] as const
export type ActionCategory = (typeof ACTION_CATEGORIES)[number]

export const ACTION_CATEGORY_LABELS: Record<ActionCategory, string> = {
  approvals: 'Approvals',
  schedule: 'Schedule',
  financial: 'Financial',
  documents: 'Documents',
  client_data: 'Client & Job Data',
  compliance: 'Compliance',
  punch_list: 'Punch List',
  warranty: 'Warranty',
  setup: 'Setup',
}

export type ActionSeverity = 'critical' | 'warning' | 'info'

/**
 * 1 critical and overdue/blocking, 2 critical with an upcoming deadline, 3 warning needing action soon,
 * 4 routine actionable task, 5 setup or informational.
 */
export type ActionTier = 1 | 2 | 3 | 4 | 5

export type ActionEntityType =
  | 'schedule_activity'
  | 'daily_log'
  | 'notification'
  | 'estimate'
  | 'signature_request'
  | 'project'
  | 'invoice'
  | 'subcontractor'
  | 'project_issue'
  | 'warranty_claim'

export type ActionItem = {
  /** Stable entity-based key; two sources describing one obligation share it. */
  id: string
  projectId: string | null
  projectName: string | null
  entityType: ActionEntityType
  entityId: string
  category: ActionCategory
  severity: ActionSeverity
  tier: ActionTier
  title: string
  description: string
  /** YYYY-MM-DD, only when the source record carries a real deadline. */
  dueDate: string | null
  /** YYYY-MM-DD the source record was created or reported. */
  createdAt: string | null
  responsibleUserId: string | null
  href: string
  actionLabel: string
  source: string
  resolutionCondition: string
}

export type ActionFeatures = {
  schedule: boolean
  warranty: boolean
  documents: boolean
  e_signatures: boolean
  daily_logs?: boolean
  subcontractors?: boolean
  estimates?: boolean
  invoices?: boolean
  issues?: boolean
}

export type ActionEstimateApproval = {
  estimateId: string
  estimateNumber: string
  estimateName: string
  estimateStatus: string
  projectId: string
  projectName: string | null
  requestId: string
  requestStatus: string
  requestDocumentId: string | null
  requestSourceVersionId: string | null
  snapshotDocumentId: string
  snapshotVersionId: string
  testMode: boolean
  completedAt: string | null
}

export type ActionSignedArtifact = {
  requestId: string
  projectId: string
  projectName: string | null
  title: string
  status: string
  completedAt: string | null
  hasSignedPdf: boolean
  filed: boolean
  artifactError: string | null
}

export type ActionProject = {
  id: string
  name: string
  status: string
  proposedStartDate: string | null
  primaryClientId: string | null
  addressLine1: string | null
  /** Null when the schedule module is off or activities could not be counted. */
  scheduleActivityCount: number | null
}

export type ActionInvoice = {
  id: string
  invoiceNumber: string
  title: string
  projectId: string
  projectName: string | null
  status: string
  dueDate: string
  totalCents: number
  paidCents: number
}

export type ActionIssue = {
  id: string
  projectId: string
  projectName: string | null
  label: string | null
  description: string
  status: string
  priority: string
  dueDate: string | null
  builderApprovedAt: string | null
  responsibleUserId: string | null
  reportedAt: string | null
}

export type ActionWarrantyClaim = {
  id: string
  projectId: string
  projectName: string | null
  title: string
  status: string
  assignedTo: string | null
  reportedAt: string | null
}

export type ActionSources = {
  notifications?: AttentionNotification[]
  activities?: AttentionActivity[]
  logDelays?: AttentionDailyLogDelay[]
  estimateApprovals?: ActionEstimateApproval[]
  signedArtifacts?: ActionSignedArtifact[]
  projects?: ActionProject[]
  invoices?: ActionInvoice[]
  qualification?: QualificationAttention[]
  issues?: ActionIssue[]
  warrantyClaims?: ActionWarrantyClaim[]
  /**
   * Entity types whose authoritative source loaded fully for this user. Unread notifications pointing at one of
   * these entities are kept only when the live record still needs action, so resolved work stops resurfacing.
   */
  authoritative?: ReadonlySet<ActionEntityType>
}

export type ActionContext = {
  today: string
  userId: string
  manager: boolean
  features: ActionFeatures
  /** Signed PDFs normally file within seconds; only flag ones still unfiled after this many minutes. */
  artifactGraceMinutes?: number
  now?: Date
}

/** Stages where a contract exists and construction work is committed. */
export const COMMITTED_STAGES = new Set([
  'preconstruction',
  'under_construction',
  'final_inspection',
  'punch_list',
  'substantially_complete',
])
const SITE_WORK_STAGES = new Set(['preconstruction', 'under_construction'])
export const START_WINDOW_DAYS = 14
export const INVOICE_CRITICAL_DAYS = 30
const HIGH_PRIORITIES = new Set(['high', 'critical'])
const OPEN_ISSUE_STATUSES = new Set(['open', 'in_progress'])
const CLAIM_REVIEW_STATUSES = new Set(['submitted', 'under_review'])
const CLAIM_WORK_STATUSES = new Set(['accepted', 'in_progress'])

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const SIGNATURE_KEY = new RegExp(`^signature:(${UUID}):`, 'i')
const CLAIM_KEY = new RegExp(`^claim:(${UUID}):`, 'i')
const SUBCONTRACTOR_LINK = new RegExp(`^/subcontractors/(${UUID})`, 'i')
const WARRANTY_KINDS = new Set(['warranty_claim', 'warranty_milestone', 'warranty_reminder', 'anniversary_card'])

function clip(text: string, max = 140): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat
}

function joinNames(names: string[]): string {
  if (names.length <= 2) return names.join(' and ')
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`
}

function plural(n: number, word: string) {
  return `${n} ${n === 1 ? word : `${word}s`}`
}

export function daysBetween(from: string, to: string): number {
  const utc = (d: string) => {
    const [y, m, day] = d.slice(0, 10).split('-').map(Number)
    return Date.UTC(y, m - 1, day)
  }
  return Math.round((utc(to) - utc(from)) / 86_400_000)
}

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
const money = (cents: number) => usd.format(cents / 100)

/** Which entity an unread notification describes, so it collapses into the live record's item. */
export function notificationEntity(n: Pick<AttentionNotification, 'id' | 'kind' | 'dedupe_key' | 'link'>): {
  entityType: ActionEntityType
  entityId: string
} {
  const signature = n.kind === 'signature_request' ? n.dedupe_key?.match(SIGNATURE_KEY) : null
  if (signature) return { entityType: 'signature_request', entityId: signature[1].toLowerCase() }
  const claim = n.kind === 'warranty_claim' ? n.dedupe_key?.match(CLAIM_KEY) : null
  if (claim) return { entityType: 'warranty_claim', entityId: claim[1].toLowerCase() }
  const company = n.kind === 'subcontractor_qualification' ? n.link?.match(SUBCONTRACTOR_LINK) : null
  if (company) return { entityType: 'subcontractor', entityId: company[1].toLowerCase() }
  return { entityType: 'notification', entityId: n.id }
}

function notificationCategory(kind: string): ActionCategory {
  if (WARRANTY_KINDS.has(kind)) return 'warranty'
  if (kind === 'signature_request') return 'documents'
  if (kind === 'subcontractor_qualification') return 'compliance'
  return 'setup'
}

function notificationAction(kind: string): string {
  if (kind === 'subcontractor_qualification') return 'Review Qualification'
  if (kind === 'warranty_claim') return 'Open Warranty Claim'
  if (WARRANTY_KINDS.has(kind)) return 'Open Warranty'
  if (kind === 'signature_request') return 'Review Signed Document'
  return 'Open'
}

const key = (entityType: ActionEntityType, entityId: string) => `${entityType}:${entityId}`

function scheduleItems(activities: AttentionActivity[], ctx: ActionContext): ActionItem[] {
  if (!ctx.features.schedule) return []
  return activities.map((a) => {
    const overdue = !!a.planned_end && a.planned_end < ctx.today
    const companies = ctx.features.subcontractors ? (a.companies ?? []) : []
    const base =
      a.status === 'delayed'
        ? 'Marked delayed on the construction schedule. Update the plan or status.'
        : 'Still open after its planned finish date. Update progress or reschedule.'
    return {
      id: key('schedule_activity', a.id),
      projectId: a.project_id,
      projectName: a.projectName,
      entityType: 'schedule_activity',
      entityId: a.id,
      category: 'schedule',
      severity: 'critical',
      tier: 1,
      title: a.status === 'delayed' ? `${a.name} is delayed` : `${a.name} is past its planned finish`,
      description: companies.length > 0 ? `${base} Assigned to ${joinNames(companies)}.` : base,
      dueDate: a.planned_end,
      createdAt: null,
      responsibleUserId: null,
      href: `/projects/${a.project_id}/schedule`,
      actionLabel: 'View Schedule',
      source: companies.length > 0 ? 'Assigned work' : 'Schedule',
      resolutionCondition: overdue ? 'Activity completed, skipped or rescheduled' : 'Activity no longer marked delayed',
    } satisfies ActionItem
  })
}

function dailyLogItems(logDelays: AttentionDailyLogDelay[], ctx: ActionContext): ActionItem[] {
  if (!ctx.features.daily_logs) return []
  return logDelays.map((l) => ({
    id: key('daily_log', l.id),
    projectId: l.project_id,
    projectName: l.projectName,
    entityType: 'daily_log',
    entityId: l.id,
    category: 'schedule',
    severity: 'warning',
    tier: 3,
    title: 'Delay reported in the Daily Log',
    description: `Field note: “${clip(l.delay_reason || l.delay_description)}”`,
    dueDate: null,
    createdAt: l.log_date,
    responsibleUserId: null,
    href: `/projects/${l.project_id}/daily-logs/${l.id}`,
    actionLabel: 'Open Log',
    source: 'Daily Log',
    resolutionCondition: 'Delay is older than the 7-day reporting window',
  }))
}

function notificationItems(notifications: AttentionNotification[], ctx: ActionContext): ActionItem[] {
  return notifications
    .filter((n) => isActionableNotification(n) && notificationFeatureEnabled(n.kind, ctx.features))
    .map((n) => {
      const { entityType, entityId } = notificationEntity(n)
      return {
        id: key(entityType, entityId),
        projectId: n.project_id,
        projectName: n.projectName,
        entityType,
        entityId,
        category: notificationCategory(n.kind),
        severity: 'warning',
        tier: 4,
        title: n.title,
        description: n.body ?? '',
        dueDate: null,
        createdAt: n.created_at.slice(0, 10),
        responsibleUserId: ctx.userId,
        href: n.link ?? (n.project_id ? `/projects/${n.project_id}` : '/dashboard'),
        actionLabel: notificationAction(n.kind),
        source: 'Notification',
        resolutionCondition: 'Notification read, or the underlying record no longer needs action',
      } satisfies ActionItem
    })
}

/**
 * The estimate is still Submitted although the signing request for that exact estimate version completed.
 * A signature is not an approval: the builder records the decision on the estimate itself.
 */
function estimateItems(rows: ActionEstimateApproval[], ctx: ActionContext): ActionItem[] {
  if (!ctx.manager || !ctx.features.estimates || !ctx.features.e_signatures || !ctx.features.documents) return []
  return rows
    .filter(
      (r) =>
        r.requestStatus === 'completed' &&
        r.estimateStatus === 'submitted' &&
        r.requestDocumentId === r.snapshotDocumentId &&
        r.requestSourceVersionId === r.snapshotVersionId,
    )
    .map((r) => ({
      id: key('estimate', r.estimateId),
      projectId: r.projectId,
      projectName: r.projectName,
      entityType: 'estimate',
      entityId: r.estimateId,
      category: 'approvals',
      severity: 'warning',
      tier: 3,
      title: `Review signed estimate ${r.estimateNumber}`,
      description: r.testMode
        ? `${r.estimateName} was signed in test mode, which never records approval. Record the decision on the estimate.`
        : `${r.estimateName} is fully signed but still Submitted. Confirm the signed version and record the decision.`,
      dueDate: null,
      createdAt: r.completedAt?.slice(0, 10) ?? null,
      responsibleUserId: null,
      href: `/estimates/${r.estimateId}`,
      actionLabel: 'Review Estimate',
      source: 'Estimate',
      resolutionCondition: 'Estimate approved or rejected',
    }))
}

function signedArtifactItems(rows: ActionSignedArtifact[], ctx: ActionContext): ActionItem[] {
  if (!ctx.manager || !ctx.features.e_signatures || !ctx.features.documents) return []
  const now = ctx.now ?? new Date()
  const graceMs = (ctx.artifactGraceMinutes ?? 60) * 60_000
  return rows
    .filter((r) => {
      if (r.status !== 'completed' || (r.hasSignedPdf && r.filed)) return false
      if (r.artifactError) return true
      return !!r.completedAt && now.getTime() - new Date(r.completedAt).getTime() > graceMs
    })
    .map((r) => ({
      id: key('signature_request', r.requestId),
      projectId: r.projectId,
      projectName: r.projectName,
      entityType: 'signature_request',
      entityId: r.requestId,
      category: 'documents',
      severity: 'warning',
      tier: 3,
      title: `File signed document: ${r.title}`,
      description: r.hasSignedPdf
        ? 'Signing is complete and the signed PDF is stored, but it is not filed in the project documents.'
        : 'Signing is complete but the signed PDF has not been retrieved from Dropbox Sign yet.',
      dueDate: null,
      createdAt: r.completedAt?.slice(0, 10) ?? null,
      responsibleUserId: null,
      href: `/projects/${r.projectId}/documents`,
      actionLabel: 'Review Signed Document',
      source: 'E-signature',
      resolutionCondition: 'Signed PDF stored and filed in project documents',
    }))
}

function projectItems(rows: ActionProject[], ctx: ActionContext): ActionItem[] {
  if (!ctx.manager) return []
  const items: ActionItem[] = []
  for (const p of rows) {
    if (!COMMITTED_STAGES.has(p.status)) continue
    const base = { projectId: p.id, projectName: p.name, entityType: 'project' as const, entityId: p.id, responsibleUserId: null }

    if (
      ctx.features.schedule &&
      SITE_WORK_STAGES.has(p.status) &&
      p.scheduleActivityCount === 0 &&
      p.proposedStartDate &&
      daysBetween(ctx.today, p.proposedStartDate) <= START_WINDOW_DAYS
    ) {
      const days = daysBetween(ctx.today, p.proposedStartDate)
      items.push({
        ...base,
        id: `project-schedule:${p.id}`,
        category: 'schedule',
        severity: 'warning',
        tier: 3,
        title: days >= 0 ? 'Project starts soon — construction schedule incomplete' : 'Project started without a construction schedule',
        description:
          days > 0
            ? `Planned start in ${plural(days, 'day')} with no schedule activities yet.`
            : days === 0
              ? 'Planned to start today with no schedule activities yet.'
              : `Planned start was ${plural(-days, 'day')} ago and no schedule activities exist.`,
        dueDate: p.proposedStartDate,
        createdAt: null,
        href: `/projects/${p.id}/schedule`,
        actionLabel: 'Build Schedule',
        source: 'Project',
        resolutionCondition: 'At least one schedule activity added, or the start date moved out of the window',
      })
    }

    if (!p.primaryClientId) {
      items.push({
        ...base,
        id: `project-contact:${p.id}`,
        category: 'client_data',
        severity: 'warning',
        tier: 4,
        title: 'Primary homeowner contact needs review',
        description: 'This active job has no primary homeowner, so estimates, invoices and updates have no recipient.',
        dueDate: null,
        createdAt: null,
        href: `/projects/${p.id}/contacts`,
        actionLabel: 'Manage Contacts',
        source: 'Project',
        resolutionCondition: 'Primary homeowner linked to the project',
      })
    }

    if (SITE_WORK_STAGES.has(p.status) && !p.addressLine1?.trim()) {
      items.push({
        ...base,
        id: `project-address:${p.id}`,
        category: 'client_data',
        severity: 'info',
        tier: 5,
        title: 'Jobsite address missing',
        description: 'Crews, inspections and deliveries need the physical jobsite address. This is separate from the homeowner mailing address.',
        dueDate: null,
        createdAt: null,
        href: `/projects/${p.id}/edit`,
        actionLabel: 'Add Jobsite Address',
        source: 'Project',
        resolutionCondition: 'Jobsite street address saved on the project',
      })
    }
  }
  return items
}

/** Receivables only: issued or partially paid, past due, with a real balance. Drafts and voided invoices never count. */
function invoiceItems(rows: ActionInvoice[], ctx: ActionContext): ActionItem[] {
  if (!ctx.manager || !ctx.features.invoices) return []
  return rows
    .filter((r) => (r.status === 'issued' || r.status === 'partially_paid') && r.dueDate < ctx.today && r.totalCents - r.paidCents > 0)
    .map((r) => {
      const days = daysBetween(r.dueDate, ctx.today)
      const critical = days > INVOICE_CRITICAL_DAYS
      return {
        id: key('invoice', r.id),
        projectId: r.projectId,
        projectName: r.projectName,
        entityType: 'invoice',
        entityId: r.id,
        category: 'financial',
        severity: critical ? 'critical' : 'warning',
        tier: critical ? 1 : 3,
        title: `Invoice ${r.invoiceNumber} is ${plural(days, 'day')} overdue`,
        description: `${money(r.totalCents - r.paidCents)} outstanding on “${clip(r.title, 80)}”.`,
        dueDate: r.dueDate,
        createdAt: null,
        responsibleUserId: null,
        href: `/invoices/${r.id}`,
        actionLabel: 'Review Invoice',
        source: 'Invoice',
        resolutionCondition: 'Invoice paid in full or voided',
      } satisfies ActionItem
    })
}

const QUALIFICATION_TIERS: Record<QualificationAttention['kind'], { severity: ActionSeverity; tier: ActionTier }> = {
  not_cleared_on_project: { severity: 'critical', tier: 1 },
  expired: { severity: 'critical', tier: 1 },
  awaiting_review: { severity: 'warning', tier: 3 },
  expiring: { severity: 'warning', tier: 3 },
  missing: { severity: 'warning', tier: 4 },
}

function qualificationItems(rows: QualificationAttention[], ctx: ActionContext): ActionItem[] {
  if (!ctx.manager || !ctx.features.subcontractors) return []
  return rows.map((q) => ({
    id: key('subcontractor', q.companyId.toLowerCase()),
    projectId: null,
    projectName: null,
    entityType: 'subcontractor',
    entityId: q.companyId,
    category: 'compliance',
    ...QUALIFICATION_TIERS[q.kind],
    title: `${q.companyName}: ${q.label}`,
    description: q.detail,
    dueDate: null,
    createdAt: null,
    responsibleUserId: null,
    href: q.href,
    actionLabel: 'Review Qualification',
    source: 'Qualification',
    resolutionCondition: 'Evidence reviewed or replaced, or a qualification decision recorded',
  }))
}

function issueItems(rows: ActionIssue[], ctx: ActionContext): ActionItem[] {
  if (!ctx.features.issues) return []
  const items: ActionItem[] = []
  for (const i of rows) {
    const mine = i.responsibleUserId === ctx.userId
    const label = i.label?.trim() || clip(i.description, 80)
    const base = {
      id: key('project_issue', i.id),
      projectId: i.projectId,
      projectName: i.projectName,
      entityType: 'project_issue' as const,
      entityId: i.id,
      category: 'punch_list' as const,
      responsibleUserId: i.responsibleUserId,
      createdAt: i.reportedAt?.slice(0, 10) ?? null,
      href: `/projects/${i.projectId}/issues/${i.id}`,
      source: 'Punch list',
    }
    if (OPEN_ISSUE_STATUSES.has(i.status) && (ctx.manager || mine)) {
      const overdue = !!i.dueDate && i.dueDate < ctx.today
      const high = HIGH_PRIORITIES.has(i.priority)
      if (overdue) {
        items.push({
          ...base,
          severity: high ? 'critical' : 'warning',
          tier: high ? 1 : 3,
          title: `Punch item overdue: ${label}`,
          description: `${high ? 'High-priority item' : 'Item'} past its due date${i.responsibleUserId ? '' : ' with no one responsible'}.`,
          dueDate: i.dueDate,
          actionLabel: 'Resolve Issue',
          resolutionCondition: 'Item resolved, or its due date moved',
        })
      } else if (high) {
        items.push({
          ...base,
          severity: 'warning',
          tier: 4,
          title: `High-priority punch item: ${label}`,
          description: i.responsibleUserId ? 'Open high-priority item.' : 'Open high-priority item with no one responsible.',
          dueDate: i.dueDate,
          actionLabel: 'Resolve Issue',
          resolutionCondition: 'Item resolved or priority lowered',
        })
      }
    } else if (i.status === 'resolved' && !i.builderApprovedAt && ctx.manager) {
      items.push({
        ...base,
        severity: 'warning',
        tier: 4,
        title: `Punch item awaiting sign-off: ${label}`,
        description: 'Marked resolved and waiting for builder approval before the homeowner can confirm it.',
        dueDate: null,
        actionLabel: 'Review Issue',
        resolutionCondition: 'Builder approval recorded',
      })
    }
  }
  return items
}

function warrantyItems(rows: ActionWarrantyClaim[], ctx: ActionContext): ActionItem[] {
  if (!ctx.features.warranty) return []
  const items: ActionItem[] = []
  for (const c of rows) {
    const base = {
      id: key('warranty_claim', c.id.toLowerCase()),
      projectId: c.projectId,
      projectName: c.projectName,
      entityType: 'warranty_claim' as const,
      entityId: c.id,
      category: 'warranty' as const,
      dueDate: null,
      createdAt: c.reportedAt?.slice(0, 10) ?? null,
      href: `/projects/${c.projectId}/warranty`,
      actionLabel: 'Open Warranty Claim',
      source: 'Warranty',
    }
    if (CLAIM_REVIEW_STATUSES.has(c.status) && ctx.manager) {
      items.push({
        ...base,
        severity: 'warning',
        tier: 3,
        title: `Warranty claim awaiting review: ${c.title}`,
        description: 'Record a coverage decision for this homeowner claim.',
        responsibleUserId: null,
        resolutionCondition: 'Coverage decision recorded',
      })
    } else if (CLAIM_WORK_STATUSES.has(c.status) && (c.assignedTo === ctx.userId || (ctx.manager && !c.assignedTo))) {
      items.push({
        ...base,
        severity: 'warning',
        tier: 4,
        title: c.assignedTo ? `Warranty repair assigned to you: ${c.title}` : `Covered warranty claim needs an assignee: ${c.title}`,
        description: c.assignedTo ? 'Complete the corrective work and mark it ready for homeowner validation.' : 'Assign someone to carry out the covered repair.',
        responsibleUserId: c.assignedTo,
        resolutionCondition: c.assignedTo ? 'Claim marked ready for validation' : 'Claim assigned',
      })
    }
  }
  return items
}

export function compareActionItems(a: ActionItem, b: ActionItem): number {
  if (a.tier !== b.tier) return a.tier - b.tier
  if (a.dueDate !== b.dueDate) {
    if (!a.dueDate) return 1
    if (!b.dueDate) return -1
    return a.dueDate.localeCompare(b.dueDate)
  }
  if (a.createdAt !== b.createdAt) return (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
  return a.title.localeCompare(b.title) || a.id.localeCompare(b.id)
}

/**
 * The single authoritative list: deterministic rules over verified records, deduplicated by entity key
 * (the most urgent version wins, a live record beats a notification about it), then ordered by urgency.
 */
export function buildActionItems(sources: ActionSources, ctx: ActionContext): ActionItem[] {
  const direct = [
    ...scheduleItems(sources.activities ?? [], ctx),
    ...dailyLogItems(sources.logDelays ?? [], ctx),
    ...estimateItems(sources.estimateApprovals ?? [], ctx),
    ...signedArtifactItems(sources.signedArtifacts ?? [], ctx),
    ...projectItems(sources.projects ?? [], ctx),
    ...invoiceItems(sources.invoices ?? [], ctx),
    ...qualificationItems(sources.qualification ?? [], ctx),
    ...issueItems(sources.issues ?? [], ctx),
    ...warrantyItems(sources.warrantyClaims ?? [], ctx),
  ]
  const live = new Set(direct.map((i) => i.id))
  const authoritative = sources.authoritative ?? new Set<ActionEntityType>()
  const fromNotifications = notificationItems(sources.notifications ?? [], ctx).filter(
    (n) => n.entityType === 'notification' || !authoritative.has(n.entityType) || live.has(n.id),
  )

  const byId = new Map<string, ActionItem>()
  for (const item of [...direct, ...fromNotifications]) {
    const existing = byId.get(item.id)
    if (!existing || item.tier < existing.tier) byId.set(item.id, item)
  }
  return [...byId.values()].sort(compareActionItems)
}

export function categoryCounts(items: ActionItem[]): Partial<Record<ActionCategory, number>> {
  const counts: Partial<Record<ActionCategory, number>> = {}
  for (const i of items) counts[i.category] = (counts[i.category] ?? 0) + 1
  return counts
}

export function isActionCategory(value: unknown): value is ActionCategory {
  return typeof value === 'string' && (ACTION_CATEGORIES as readonly string[]).includes(value)
}
