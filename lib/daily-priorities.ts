import { z } from 'zod'
import type { ActionItem } from './action-items'

/**
 * Daily Priorities: the app picks and orders the work deterministically from live, permission-checked
 * records. The model only rewrites each picked item as a short heading and one "why" sentence, and every
 * sentence is validated against the facts we supplied before it is shown.
 */

export const PRIORITY_LIMIT = 5
export const UPCOMING_DAYS = 7

export const PRIORITY_LIMITS = {
  autoPerUserPerHour: 12,
  manualPerUserPerHour: 6,
  manualMinIntervalMs: 30_000,
  perOrgPerDay: 500,
  timeoutMs: 20_000,
  lockMs: 30_000,
  headingMax: 90,
  whyMax: 240,
} as const

export type PriorityCategory = 'blocking' | 'overdue' | 'due_today' | 'upcoming' | 'waiting' | 'planning'

/**
 * "blocking" is only assigned when an overdue activity has verified open downstream activities, so it ranks
 * above plain overdue work. "planning" (missing schedule dates) ranks last: it limits forecasting but
 * nothing is late yet.
 */
const CATEGORY_RANK: Record<PriorityCategory, number> = {
  blocking: 0,
  overdue: 1,
  due_today: 2,
  upcoming: 3,
  waiting: 4,
  planning: 5,
}

export const CATEGORY_LABEL: Record<PriorityCategory, string> = {
  blocking: 'Blocking work',
  overdue: 'Overdue',
  due_today: 'Due today',
  upcoming: 'Due this week',
  waiting: 'Waiting on a decision',
  planning: 'Missing schedule dates',
}

/**
 * Within a category, construction-impacting records outrank administrative ones, so an overdue RFI or
 * activity sits above an overdue personal to-do.
 */
const IMPACT_WEIGHT: Record<string, number> = {
  schedule_activity: 0,
  rfi: 1,
  project_issue: 2,
  estimate: 3,
  change_order: 3,
  quote_request: 4,
  schedule_gap: 5,
  staff_task: 6,
}

function impactWeight(entityType: string): number {
  return IMPACT_WEIGHT[entityType] ?? 7
}

export type PriorityOwner = { kind: 'you' | 'person' | 'approver' | 'unassigned'; label: string }

export type PriorityCandidate = {
  id: string
  entityType: string
  entityId: string
  projectId: string | null
  projectName: string | null
  title: string
  reason: string
  category: PriorityCategory
  dueDate: string | null
  createdAt: string | null
  owner: PriorityOwner
  mine: boolean
  href: string
  actionLabel: string
  source: string
  /** Deterministic recommended step; never performed automatically. */
  nextAction: string
  /** Verified consequence of delay (from dependency or schedule records), or null when none is known. */
  impact: string | null
  /** Open downstream activities that depend on this record; 0 when none are verified. */
  blockedCount: number
  digest: string
}

/** Active project with open activities that have no planned start or finish. */
export type PriorityScheduleGap = {
  projectId: string
  projectName: string | null
  missingCount: number
}

export type PriorityTask = {
  id: string
  title: string
  projectId: string | null
  projectName: string | null
  dueDate: string | null
  createdAt: string
}

export type PriorityActivity = {
  id: string
  project_id: string
  projectName: string | null
  name: string
  status: string
  planned_end: string | null
  assigned_to?: string | null
}

export type PriorityQuoteRequest = {
  id: string
  projectId: string
  projectName: string | null
  title: string
  /** Response deadline as a calendar date in the org zone. */
  deadlineDate: string
  createdBy: string | null
}

export type CandidateInputs = {
  actionItems: ActionItem[]
  tasks: PriorityTask[]
  activities: PriorityActivity[]
  quoteRequests: PriorityQuoteRequest[]
  /** Activity id → count of open successors from schedule_dependencies. Missing ids mean none verified. */
  dependents?: Map<string, number>
  scheduleGaps?: PriorityScheduleGap[]
}

export type CandidateContext = {
  userId: string
  today: string
  scope: 'mine' | 'all'
  projectId: string | null
  manager: boolean
  names: Map<string, string>
}

/** Only these Action Center sources map onto the briefing's rules; the rest stay in the Action Center. */
const ACTION_TYPES = new Set(['schedule_activity', 'project_issue', 'rfi', 'estimate', 'change_order'])
const APPROVAL_TYPES = new Set(['estimate', 'change_order'])

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + days))
  return date.toISOString().slice(0, 10)
}

function dateCategory(dueDate: string | null, today: string): PriorityCategory | null {
  if (!dueDate) return null
  if (dueDate < today) return 'overdue'
  if (dueDate === today) return 'due_today'
  if (dueDate <= addDaysIso(today, UPCOMING_DAYS)) return 'upcoming'
  return null
}

function ownerFor(userId: string | null, ctx: CandidateContext): PriorityOwner {
  if (!userId) return { kind: 'unassigned', label: 'Unassigned' }
  if (userId === ctx.userId) return { kind: 'you', label: 'You' }
  return { kind: 'person', label: ctx.names.get(userId) ?? 'A teammate' }
}

/** FNV-1a, enough to tell "same facts" from "changed facts"; not a security boundary. */
export function hashText(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

type Draft = Omit<PriorityCandidate, 'digest'>

function withDigest(c: Draft): PriorityCandidate {
  const digest = hashText(
    [c.id, c.category, c.dueDate ?? '', c.title, c.reason, c.owner.label, c.projectName ?? '', c.nextAction, c.impact ?? ''].join('|'),
  )
  return { ...c, digest }
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`
}

export function blockedImpact(count: number): string {
  return `${plural(count, 'downstream activity depends', 'downstream activities depend')} on this finishing.`
}

/** Fixed wording per record type and category, so the recommendation is traceable and never model-written. */
export function nextActionFor(entityType: string, category: PriorityCategory): string {
  switch (entityType) {
    case 'schedule_activity':
      if (category === 'blocking') return 'Update progress or reschedule so dependent work can start.'
      if (category === 'overdue') return 'Update progress, mark it complete, or reschedule it.'
      return 'Confirm the activity is on track or adjust the plan.'
    case 'rfi':
      return 'Open the RFI and respond, or follow up with the responder.'
    case 'estimate':
      return 'Review the estimate, then approve it or send it back.'
    case 'change_order':
      return 'Review the change order, then approve it or send it back.'
    case 'project_issue':
      return 'Verify the issue on site and update its status.'
    case 'quote_request':
      return 'Review the quotes received, then award or close the request.'
    case 'schedule_gap':
      return 'Set planned start and finish dates on the open activities.'
    case 'staff_task':
      return category === 'overdue' ? 'Finish the to-do or move its due date.' : 'Finish the to-do.'
    default:
      return 'Open the record and decide the next step.'
  }
}

function fromActionItem(item: ActionItem, ctx: CandidateContext, dependents: Map<string, number>): Draft | null {
  if (!ACTION_TYPES.has(item.entityType)) return null
  const approval = APPROVAL_TYPES.has(item.entityType)
  const byDate = dateCategory(item.dueDate, ctx.today)
  if (item.dueDate && !byDate) return null
  const mine = approval ? ctx.manager : item.responsibleUserId === ctx.userId
  const blockedCount = item.entityType === 'schedule_activity' && byDate === 'overdue' ? (dependents.get(item.entityId) ?? 0) : 0
  const category: PriorityCategory | null =
    blockedCount > 0 ? 'blocking' : (byDate ?? (approval || mine ? 'waiting' : null))
  if (!category) return null
  return {
    nextAction: nextActionFor(item.entityType, category),
    impact: blockedCount > 0 ? blockedImpact(blockedCount) : null,
    blockedCount,
    id: `${item.entityType}:${item.entityId}`,
    entityType: item.entityType,
    entityId: item.entityId,
    projectId: item.projectId,
    projectName: item.projectName,
    title: item.title,
    reason: item.description,
    category,
    dueDate: item.dueDate,
    createdAt: item.createdAt,
    owner: approval ? { kind: 'approver', label: 'Needs a manager approval' } : ownerFor(item.responsibleUserId, ctx),
    mine,
    href: item.href,
    actionLabel: item.actionLabel,
    source: item.source,
  }
}

function fromTask(t: PriorityTask, ctx: CandidateContext): Draft | null {
  const byDate = dateCategory(t.dueDate, ctx.today)
  if (t.dueDate && !byDate) return null
  return {
    nextAction: nextActionFor('staff_task', byDate ?? 'waiting'),
    impact: null,
    blockedCount: 0,
    id: `staff_task:${t.id}`,
    entityType: 'staff_task',
    entityId: t.id,
    projectId: t.projectId,
    projectName: t.projectName,
    title: t.title,
    reason: byDate === 'overdue' ? 'Your to-do is past its due date.' : t.dueDate ? 'Your to-do has a due date coming up.' : 'Open to-do assigned to you.',
    category: byDate ?? 'waiting',
    dueDate: t.dueDate,
    createdAt: t.createdAt.slice(0, 10),
    owner: { kind: 'you', label: 'You' },
    mine: true,
    href: '/my-work',
    actionLabel: 'Open to-do',
    source: 'To-do',
  }
}

/** Overdue activities already arrive through the Action Center; this adds the ones finishing in the next week. */
function fromActivity(a: PriorityActivity, ctx: CandidateContext): Draft | null {
  if (!a.planned_end || a.planned_end < ctx.today) return null
  if (a.status === 'completed' || a.status === 'skipped') return null
  const category = dateCategory(a.planned_end, ctx.today)
  if (!category) return null
  return {
    nextAction: nextActionFor('schedule_activity', category),
    impact: null,
    blockedCount: 0,
    id: `schedule_activity:${a.id}`,
    entityType: 'schedule_activity',
    entityId: a.id,
    projectId: a.project_id,
    projectName: a.projectName,
    title: `${a.name} is planned to finish`,
    reason: 'Scheduled activity with a planned finish coming up. Confirm it is on track or update the plan.',
    category,
    dueDate: a.planned_end,
    createdAt: null,
    owner: ownerFor(a.assigned_to ?? null, ctx),
    mine: a.assigned_to === ctx.userId,
    href: `/projects/${a.project_id}/schedule?activity=${a.id}`,
    actionLabel: 'View Schedule',
    source: 'Schedule',
  }
}

function fromQuoteRequest(q: PriorityQuoteRequest, ctx: CandidateContext): Draft | null {
  if (q.deadlineDate >= ctx.today) return null
  return {
    nextAction: nextActionFor('quote_request', 'overdue'),
    impact: null,
    blockedCount: 0,
    id: `quote_request:${q.id}`,
    entityType: 'quote_request',
    entityId: q.id,
    projectId: q.projectId,
    projectName: q.projectName,
    title: `Quote request “${q.title.slice(0, 80)}” is past its response deadline`,
    reason: 'The response deadline has passed. Review the quotes received, then award or close the request.',
    category: 'overdue',
    dueDate: q.deadlineDate,
    createdAt: null,
    owner: ownerFor(q.createdBy, ctx),
    mine: q.createdBy === ctx.userId,
    href: `/projects/${q.projectId}/subcontractor-work/quotes/${q.id}`,
    actionLabel: 'Review Quotes',
    source: 'Quote request',
  }
}

/** Schedule gaps are decisions for whoever manages the schedule, so they count as "mine" only for managers. */
function fromScheduleGap(g: PriorityScheduleGap, ctx: CandidateContext): Draft | null {
  if (g.missingCount <= 0) return null
  return {
    id: `schedule_gap:${g.projectId}`,
    entityType: 'schedule_gap',
    entityId: g.projectId,
    projectId: g.projectId,
    projectName: g.projectName,
    title: 'Set missing schedule dates',
    reason: `${plural(g.missingCount, 'open activity has', 'open activities have')} no planned start or finish date.`,
    category: 'planning',
    dueDate: null,
    createdAt: null,
    owner: { kind: 'unassigned', label: 'Schedule manager' },
    mine: ctx.manager,
    href: `/projects/${g.projectId}/schedule`,
    actionLabel: 'Open Schedule',
    source: 'Schedule',
    nextAction: nextActionFor('schedule_gap', 'planning'),
    impact: 'Project finish forecasts are incomplete until these dates are set.',
    blockedCount: 0,
  }
}

/**
 * Order: category → verified downstream count → record impact type → yours first → earliest due →
 * oldest → id. Every key comes from source records, so the same data always produces the same order.
 */
export function comparePriorities(a: PriorityCandidate, b: PriorityCandidate): number {
  const rank = CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category]
  if (rank !== 0) return rank
  if (a.blockedCount !== b.blockedCount) return b.blockedCount - a.blockedCount
  const weight = impactWeight(a.entityType) - impactWeight(b.entityType)
  if (weight !== 0) return weight
  if (a.mine !== b.mine) return a.mine ? -1 : 1
  if (a.dueDate !== b.dueDate) {
    if (!a.dueDate) return 1
    if (!b.dueDate) return -1
    return a.dueDate < b.dueDate ? -1 : 1
  }
  if (a.createdAt !== b.createdAt) {
    if (!a.createdAt) return 1
    if (!b.createdAt) return -1
    return a.createdAt < b.createdAt ? -1 : 1
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * Every source must already be permission-filtered (RLS + feature flags). Duplicates collapse onto one
 * entity key, keeping the most urgent description; scope and project filters run before ranking.
 */
export function buildPriorityCandidates(inputs: CandidateInputs, ctx: CandidateContext): { top: PriorityCandidate[]; total: number } {
  const dependents = inputs.dependents ?? new Map<string, number>()
  const drafts = [
    ...inputs.actionItems.map((i) => fromActionItem(i, ctx, dependents)),
    ...inputs.tasks.map((t) => fromTask(t, ctx)),
    ...inputs.activities.map((a) => fromActivity(a, ctx)),
    ...inputs.quoteRequests.map((q) => fromQuoteRequest(q, ctx)),
    ...(inputs.scheduleGaps ?? []).map((g) => fromScheduleGap(g, ctx)),
  ].filter((d): d is Draft => d !== null)

  const byId = new Map<string, PriorityCandidate>()
  for (const draft of drafts) {
    if (ctx.scope === 'mine' && !draft.mine) continue
    if (ctx.projectId && draft.projectId !== ctx.projectId) continue
    const candidate = withDigest(draft)
    const existing = byId.get(candidate.id)
    if (!existing || comparePriorities(candidate, existing) < 0) byId.set(candidate.id, candidate)
  }
  const sorted = [...byId.values()].sort(comparePriorities)
  return { top: sorted.slice(0, PRIORITY_LIMIT), total: sorted.length }
}

export function scopeKey(scope: 'mine' | 'all', projectId: string | null): string {
  return `${scope}|${projectId ?? 'all'}`
}

/** Changes whenever the chosen items, their facts, or the calendar day change. */
export function briefingFingerprint(top: PriorityCandidate[], today: string): string {
  return `${today}.${hashText(top.map((c) => `${c.id}:${c.digest}`).join(','))}`
}

/* ------------------------------ Model contract ------------------------------ */

export const briefingModelSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().max(200),
        heading: z.string().max(200),
        why: z.string().max(500),
      }),
    )
    .max(PRIORITY_LIMIT * 2),
})
export type BriefingModelOutput = z.infer<typeof briefingModelSchema>

export type PromptCandidate = { id: string; title: string; project: string; owner: string; status: string; due: string; facts: string }

/** Only what the model needs to phrase the item. No amounts, contact details, or ids beyond the opaque key. */
export function toPromptCandidates(top: PriorityCandidate[]): PromptCandidate[] {
  return top.map((c) => ({
    id: c.id,
    title: c.title,
    project: c.projectName ?? 'No project',
    owner: c.owner.label,
    status: CATEGORY_LABEL[c.category],
    due: c.dueDate ?? 'none',
    facts: c.impact ? `${c.reason} ${c.impact}` : c.reason,
  }))
}

export type BriefingSummary = { id: string; digest: string; heading: string; why: string }

const URLISH = /(https?:\/\/|www\.|\.com\b|\.net\b|\.org\b)/i
const MONEY = /[$€£¥]|\b(usd|dollars?)\b/i

function factNumbers(c: PriorityCandidate): Set<string> {
  const text = [c.title, c.reason, c.impact ?? '', c.projectName ?? '', c.dueDate ?? '', c.owner.label].join(' ')
  const nums = new Set(text.match(/\d+/g) ?? [])
  for (const n of [...nums]) nums.add(String(Number(n)))
  if (c.dueDate) {
    const [, m, d] = c.dueDate.split('-')
    nums.add(String(Number(m)))
    nums.add(String(Number(d)))
  }
  return nums
}

function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * Keeps only sentences that refer to a supplied item, stay short, add no links or money, and mention no
 * number that is not already in that item's facts. Anything else falls back to the app's own wording.
 */
export function validateBriefing(output: BriefingModelOutput, top: PriorityCandidate[]): BriefingSummary[] {
  const byId = new Map(top.map((c) => [c.id, c]))
  const seen = new Set<string>()
  const result: BriefingSummary[] = []
  for (const raw of output.items) {
    const candidate = byId.get(raw.id)
    if (!candidate || seen.has(raw.id)) continue
    const heading = clean(raw.heading)
    const why = clean(raw.why)
    if (!heading || !why) continue
    if (heading.length > PRIORITY_LIMITS.headingMax || why.length > PRIORITY_LIMITS.whyMax) continue
    const combined = `${heading} ${why}`
    if (URLISH.test(combined) || MONEY.test(combined) || /[<>]/.test(combined)) continue
    const allowed = factNumbers(candidate)
    if ((combined.match(/\d+/g) ?? []).some((n) => !allowed.has(n) && !allowed.has(String(Number(n))))) continue
    seen.add(raw.id)
    result.push({ id: raw.id, digest: candidate.digest, heading, why })
  }
  return result
}

export function parseStoredSummaries(value: unknown): BriefingSummary[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((v) => {
    if (!v || typeof v !== 'object') return []
    const { id, digest, heading, why } = v as Record<string, unknown>
    if (typeof id !== 'string' || typeof digest !== 'string' || typeof heading !== 'string' || typeof why !== 'string') return []
    return [{ id, digest, heading, why }]
  })
}

/* ------------------------------ Display model ------------------------------ */

export type PriorityVerb = 'Review' | 'Respond' | 'Verify' | 'Update' | 'Set dates' | 'Open'

const VERB_BY_TYPE: Record<string, PriorityVerb> = {
  estimate: 'Review',
  change_order: 'Review',
  quote_request: 'Review',
  rfi: 'Respond',
  project_issue: 'Verify',
  schedule_activity: 'Update',
  schedule_gap: 'Set dates',
}

export function priorityVerb(entityType: string): PriorityVerb {
  return VERB_BY_TYPE[entityType] ?? 'Open'
}

/** Action Center modules the briefing ranks from; a failure in any of them means the briefing is incomplete. */
export const PRIORITY_SOURCE_MODULES = new Set(['Schedule', 'Punch List', 'Change Orders', 'Questions (RFIs)', 'Estimates', 'Projects'])

export function uncheckedSources(args: {
  modules: string[]
  tasksFailed: boolean
  agendaFailed: boolean
  quotesFailed: boolean
  dependenciesFailed?: boolean
  scheduleGapsFailed?: boolean
}): string[] {
  const list = args.modules.filter((m) => PRIORITY_SOURCE_MODULES.has(m))
  if (args.agendaFailed) list.push('Schedule')
  if (args.tasksFailed) list.push('To-dos')
  if (args.quotesFailed) list.push('Quote requests')
  if (args.dependenciesFailed) list.push('Schedule dependencies')
  if (args.scheduleGapsFailed) list.push('Schedule dates')
  return [...new Set(list)]
}

export type BriefingItem = {
  id: string
  heading: string
  why: string
  category: PriorityCategory
  categoryLabel: string
  dueDate: string | null
  projectName: string | null
  owner: PriorityOwner
  href: string
  actionLabel: string
  verb: PriorityVerb
  source: string
  nextAction: string
  impact: string | null
  summarized: boolean
}

export type BriefingState = 'ready' | 'needs_summary' | 'stale' | 'fallback' | 'empty'

export type Briefing = {
  state: BriefingState
  items: BriefingItem[]
  total: number
  fingerprint: string
  dataCheckedAt: string
  generatedAt: string | null
  aiAvailable: boolean
  scope: 'mine' | 'all'
  projectId: string | null
  notice: string | null
  /** Sources that failed to load; an empty briefing is only "all clear" when this is empty. */
  unchecked: string[]
}

/**
 * Model wording is reused only for items whose facts are unchanged (same digest), so a completed or edited
 * record never keeps an outdated sentence. Everything else shows the app's own title and reason.
 */
export function composeBriefing(args: {
  top: PriorityCandidate[]
  total: number
  today: string
  dataCheckedAt: string
  stored: { fingerprint: string; summaries: BriefingSummary[]; generatedAt: string | null; source: 'ai' | 'fallback' } | null
  aiAvailable: boolean
  scope: 'mine' | 'all'
  projectId: string | null
  notice?: string | null
  unchecked?: string[]
}): Briefing {
  const fingerprint = briefingFingerprint(args.top, args.today)
  const summaries = new Map((args.stored?.summaries ?? []).map((s) => [s.id, s]))
  const items: BriefingItem[] = args.top.map((c) => {
    const s = summaries.get(c.id)
    const summarized = !!s && s.digest === c.digest
    return {
      id: c.id,
      heading: summarized ? s.heading : c.title,
      why: summarized ? s.why : c.reason,
      category: c.category,
      categoryLabel: CATEGORY_LABEL[c.category],
      dueDate: c.dueDate,
      projectName: c.projectName,
      owner: c.owner,
      href: c.href,
      actionLabel: c.actionLabel,
      verb: priorityVerb(c.entityType),
      source: c.source,
      nextAction: c.nextAction,
      impact: c.impact,
      summarized,
    }
  })

  let state: BriefingState
  if (items.length === 0) state = 'empty'
  else if (!args.aiAvailable) state = 'fallback'
  else if (args.stored?.fingerprint === fingerprint) state = args.stored.source === 'ai' ? 'ready' : 'fallback'
  else if (items.some((i) => i.summarized)) state = 'stale'
  else state = 'needs_summary'

  return {
    state,
    items,
    total: args.total,
    fingerprint,
    dataCheckedAt: args.dataCheckedAt,
    generatedAt: items.some((i) => i.summarized) ? (args.stored?.generatedAt ?? null) : null,
    aiAvailable: args.aiAvailable,
    scope: args.scope,
    projectId: args.projectId,
    notice: args.notice ?? null,
    unchecked: [...new Set(args.unchecked ?? [])],
  }
}
