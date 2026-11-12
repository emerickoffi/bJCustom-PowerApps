import { z } from 'zod'

export const TEMPLATE_ACTIVITY_TYPES = ['task', 'milestone', 'inspection', 'meeting'] as const
export type TemplateActivityType = (typeof TEMPLATE_ACTIVITY_TYPES)[number]

export const TEMPLATE_LIMITS = {
  phases: 40,
  activitiesPerPhase: 80,
  activities: 400,
  durationDays: 365,
  predecessors: 10,
} as const

export type TemplateActivity = {
  key: string
  name: string
  type: TemplateActivityType
  /** Business days. 0 is a same-day event (milestones). null leaves the activity undated. */
  duration_days: number | null
  weight: number
  predecessors: string[]
}

export type TemplatePhase = { name: string; activities: TemplateActivity[] }
export type TemplateContent = { phases: TemplatePhase[] }

const activitySchema = z.object({
  key: z.string().regex(/^[a-z0-9_-]{1,40}$/i, 'Invalid activity key'),
  name: z.string().trim().min(1, 'Every activity needs a name').max(200, 'Activity names are limited to 200 characters'),
  type: z.enum(TEMPLATE_ACTIVITY_TYPES),
  duration_days: z
    .number()
    .int('Durations are whole business days')
    .min(0, 'Durations cannot be negative')
    .max(TEMPLATE_LIMITS.durationDays, `Durations are limited to ${TEMPLATE_LIMITS.durationDays} business days`)
    .nullable(),
  weight: z.number().min(0).max(1000),
  predecessors: z.array(z.string()).max(TEMPLATE_LIMITS.predecessors, `Up to ${TEMPLATE_LIMITS.predecessors} dependencies per activity`),
})

const phaseSchema = z.object({
  name: z.string().trim().min(1, 'Every phase needs a name').max(120, 'Phase names are limited to 120 characters'),
  activities: z.array(activitySchema).max(TEMPLATE_LIMITS.activitiesPerPhase, `Up to ${TEMPLATE_LIMITS.activitiesPerPhase} activities per phase`),
})

const contentSchema = z.object({
  phases: z.array(phaseSchema).max(TEMPLATE_LIMITS.phases, `Up to ${TEMPLATE_LIMITS.phases} phases`),
})

export type TemplateValidation = { ok: true; content: TemplateContent } | { ok: false; errors: string[] }

/**
 * Structural checks beyond the schema: unique keys, a total activity cap, and dependencies that point
 * only to activities earlier in the template. Earlier-only predecessors make cycles impossible and
 * match how the database schedules a template in order.
 */
export function validateTemplateContent(input: unknown): TemplateValidation {
  const parsed = contentSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, errors: [...new Set(parsed.error.issues.map((i) => i.message))] }
  }
  const content = parsed.data as TemplateContent
  const errors: string[] = []
  const seen = new Set<string>()
  let total = 0
  for (const phase of content.phases) {
    for (const act of phase.activities) {
      total += 1
      if (seen.has(act.key)) errors.push(`Duplicate activity key “${act.key}”`)
      for (const pred of act.predecessors) {
        if (pred === act.key) errors.push(`“${act.name}” cannot depend on itself`)
        else if (!seen.has(pred)) errors.push(`“${act.name}” depends on an activity that is missing or comes after it`)
      }
      if (new Set(act.predecessors).size !== act.predecessors.length) errors.push(`“${act.name}” lists the same dependency twice`)
      seen.add(act.key)
    }
  }
  if (total > TEMPLATE_LIMITS.activities) errors.push(`Templates are limited to ${TEMPLATE_LIMITS.activities} activities`)
  return errors.length ? { ok: false, errors: [...new Set(errors)] } : { ok: true, content }
}

/** Publishing also requires at least one phase with a name and one activity overall. */
export function publishBlockers(content: TemplateContent): string[] {
  const result = validateTemplateContent(content)
  const blockers = result.ok ? [] : result.errors
  if (content.phases.length === 0) blockers.push('Add at least one phase')
  else if (content.phases.every((p) => p.activities.length === 0)) blockers.push('Add at least one activity')
  return blockers
}

export type TemplateSummary = {
  phases: number
  activities: number
  milestones: number
  inspections: number
  dependencies: number
  /** Longest dependency chain in business days, or null when no activity has a duration. */
  estimatedBusinessDays: number | null
  undated: number
}

/**
 * Mirrors apply_project_template: an activity starts the business day after its latest predecessor
 * finishes (or on day 1), and a duration of N occupies N business days. Milestones (0) land on their start.
 */
export function summarizeTemplate(content: TemplateContent): TemplateSummary {
  const ends = new Map<string, number>()
  let activities = 0
  let milestones = 0
  let inspections = 0
  let dependencies = 0
  let undated = 0
  let longest = 0
  for (const phase of content.phases) {
    for (const act of phase.activities) {
      activities += 1
      if (act.type === 'milestone') milestones += 1
      if (act.type === 'inspection') inspections += 1
      dependencies += act.predecessors.length
      if (act.duration_days === null) {
        undated += 1
        continue
      }
      let start = 1
      let blocked = false
      for (const pred of act.predecessors) {
        const predEnd = ends.get(pred)
        if (predEnd === undefined) {
          blocked = true
          break
        }
        start = Math.max(start, predEnd + 1)
      }
      if (blocked) {
        undated += 1
        continue
      }
      const end = act.duration_days === 0 ? start : start + act.duration_days - 1
      ends.set(act.key, end)
      longest = Math.max(longest, end)
    }
  }
  return {
    phases: content.phases.length,
    activities,
    milestones,
    inspections,
    dependencies,
    estimatedBusinessDays: ends.size ? longest : null,
    undated,
  }
}

export function describeDuration(days: number | null): string {
  if (days === null) return 'No durations set'
  if (days < 5) return `${days} business ${days === 1 ? 'day' : 'days'}`
  const weeks = Math.round((days / 5) * 10) / 10
  return `${days} business days (about ${weeks} ${weeks === 1 ? 'week' : 'weeks'})`
}

/** Short random key that is unique within a template. */
export function newTemplateKey(existing: Iterable<string>): string {
  const taken = new Set(existing)
  for (;;) {
    const key = `k${Math.random().toString(36).slice(2, 8)}`
    if (!taken.has(key)) return key
  }
}

export function allKeys(content: TemplateContent): string[] {
  return content.phases.flatMap((p) => p.activities.map((a) => a.key))
}

/** Removes an activity and every dependency that pointed to it. */
export function removeActivity(content: TemplateContent, key: string): TemplateContent {
  return {
    phases: content.phases.map((p) => ({
      ...p,
      activities: p.activities
        .filter((a) => a.key !== key)
        .map((a) => (a.predecessors.includes(key) ? { ...a, predecessors: a.predecessors.filter((k) => k !== key) } : a)),
    })),
  }
}

export function removePhase(content: TemplateContent, index: number): TemplateContent {
  const removed = new Set(content.phases[index]?.activities.map((a) => a.key) ?? [])
  return {
    phases: content.phases
      .filter((_, i) => i !== index)
      .map((p) => ({
        ...p,
        activities: p.activities.map((a) => ({ ...a, predecessors: a.predecessors.filter((k) => !removed.has(k)) })),
      })),
  }
}

export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items
  const next = items.slice()
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/**
 * After a reorder, drops dependencies that now point forward, so the draft stays valid.
 * Returns how many were removed so the editor can tell the user.
 */
export function pruneForwardDependencies(content: TemplateContent): { content: TemplateContent; removed: number } {
  const seen = new Set<string>()
  let removed = 0
  const phases = content.phases.map((p) => ({
    ...p,
    activities: p.activities.map((a) => {
      const kept = a.predecessors.filter((k) => seen.has(k))
      removed += a.predecessors.length - kept.length
      seen.add(a.key)
      return kept.length === a.predecessors.length ? a : { ...a, predecessors: kept }
    }),
  }))
  return { content: { phases }, removed }
}

/** Monday–Friday days from start to end inclusive; null when either date is missing or reversed. */
export function businessDaysBetween(startIso: string | null, endIso: string | null): number | null {
  if (!startIso || !endIso) return null
  const start = Date.parse(`${startIso}T00:00:00Z`)
  const end = Date.parse(`${endIso}T00:00:00Z`)
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null
  let days = 0
  for (let t = start; t <= end; t += 86_400_000) {
    const dow = new Date(t).getUTCDay()
    if (dow !== 0 && dow !== 6) days += 1
  }
  return days
}

export type ProjectScheduleSource = {
  phases: { id: string; name: string; sort_order: number }[]
  activities: {
    id: string
    name: string
    phase_id: string | null
    phase: string | null
    activity_type: string
    sort_order: number
    weight: number | string | null
    planned_start: string | null
    planned_end: string | null
    status: string
  }[]
  dependencies: { predecessor_id: string; successor_id: string }[]
}

/**
 * Builds reusable template content from a project's schedule. Only structure is copied: names, types,
 * durations, weights, and dependencies. Dates, assignees, notes, progress, photos, and client data are
 * never included. Skipped activities are left out.
 */
export function projectScheduleToTemplate(source: ProjectScheduleSource): TemplateContent {
  const phases = [...source.phases].sort((a, b) => a.sort_order - b.sort_order)
  const byPhase = new Map<string, ProjectScheduleSource['activities']>()
  const unphased: ProjectScheduleSource['activities'] = []
  const phaseIdByName = new Map(phases.map((p) => [p.name.trim().toLowerCase(), p.id]))
  for (const act of [...source.activities].sort((a, b) => a.sort_order - b.sort_order)) {
    if (act.status === 'skipped') continue
    const phaseId = act.phase_id ?? (act.phase ? phaseIdByName.get(act.phase.trim().toLowerCase()) : undefined)
    if (phaseId && phases.some((p) => p.id === phaseId)) {
      const list = byPhase.get(phaseId) ?? []
      list.push(act)
      byPhase.set(phaseId, list)
    } else unphased.push(act)
  }
  const ordered: TemplatePhase[] = []
  const groups: { name: string; acts: ProjectScheduleSource['activities'] }[] = phases.map((p) => ({
    name: p.name,
    acts: byPhase.get(p.id) ?? [],
  }))
  if (unphased.length) groups.push({ name: 'Other work', acts: unphased })

  const keyById = new Map<string, string>()
  let n = 0
  for (const g of groups) for (const a of g.acts) keyById.set(a.id, `a${++n}`)

  const predsBySuccessor = new Map<string, string[]>()
  for (const d of source.dependencies) {
    const list = predsBySuccessor.get(d.successor_id) ?? []
    list.push(d.predecessor_id)
    predsBySuccessor.set(d.successor_id, list)
  }

  for (const g of groups) {
    if (!g.name.trim()) continue
    ordered.push({
      name: g.name.trim().slice(0, 120),
      activities: g.acts.map((a) => {
        const type = (TEMPLATE_ACTIVITY_TYPES as readonly string[]).includes(a.activity_type)
          ? (a.activity_type as TemplateActivityType)
          : 'task'
        const duration = type === 'milestone' ? 0 : businessDaysBetween(a.planned_start, a.planned_end)
        const weight = Number(a.weight)
        return {
          key: keyById.get(a.id)!,
          name: a.name.trim().slice(0, 200),
          type,
          duration_days: duration === null ? null : Math.min(duration, TEMPLATE_LIMITS.durationDays),
          weight: Number.isFinite(weight) && weight >= 0 ? Math.min(weight, 1000) : 1,
          predecessors: [
            ...new Set((predsBySuccessor.get(a.id) ?? []).map((id) => keyById.get(id)).filter((k): k is string => Boolean(k))),
          ],
        }
      }),
    })
  }
  // A project's dependencies can point forward in sort order; keep only those the template can honor.
  return pruneForwardDependencies({ phases: ordered }).content
}

export function emptyTemplateContent(): TemplateContent {
  return { phases: [] }
}

/** Reads stored JSON defensively; anything malformed becomes an empty template rather than crashing. */
export function readTemplateContent(raw: unknown): TemplateContent {
  const result = contentSchema.safeParse(raw)
  return result.success ? (result.data as TemplateContent) : emptyTemplateContent()
}
