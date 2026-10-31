/**
 * Project completion readiness. Pure evaluation so it can be unit-tested and rendered anywhere.
 * Blocking keys mirror public.project_completion_blockers() — the database is authoritative at commit time.
 */

export type ReadinessPolicy = 'required' | 'overridable' | 'advisory' | 'not_applicable'
export type ReadinessState = 'verified' | 'incomplete' | 'needs_evidence' | 'not_applicable' | 'exception_approved'

export const GATED_REQUIREMENT_KEYS = [
  'schedule_recorded',
  'schedule_activities',
  'inspections',
  'punch_list',
  'final_walkthrough',
  'builder_signoff',
  'homeowner_linked',
] as const
export type GatedRequirementKey = (typeof GATED_REQUIREMENT_KEYS)[number]

export interface ReadinessFacts {
  features: {
    schedule: boolean
    walkthroughs: boolean
    documents: boolean
    e_signatures: boolean
    invoices: boolean
    warranty: boolean
  }
  scheduleActivityCount: number
  scheduleIncompleteCount: number
  inspectionCount: number
  inspectionsOutstandingCount: number
  openPunchItemCount: number
  finalWalkthroughSubmitted: boolean
  latestFinalSignoff: 'verified' | 'rejected' | null
  homeownerAcknowledged: boolean
  homeownerCount: number
  pendingSignatureCount: number
  /** null when the viewer cannot see financial records. */
  outstandingInvoiceCount: number | null
  pendingChangeOrderCount: number | null
}

export interface ReadinessItem {
  key: string
  label: string
  detail: string
  policy: ReadinessPolicy
  state: ReadinessState
  href: string | null
}

export type ReadinessOverall = 'ready' | 'needs_exceptions' | 'blocked'

export interface ReadinessSummary {
  items: ReadinessItem[]
  overall: ReadinessOverall
  applicableCount: number
  satisfiedCount: number
  /** Unmet required or overridable items. */
  blockers: ReadinessItem[]
  /** Unmet items that no exception can waive. */
  hardBlockers: ReadinessItem[]
  warnings: ReadinessItem[]
  nextAction: ReadinessItem | null
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function isUnmet(item: ReadinessItem): boolean {
  return item.state === 'incomplete' || item.state === 'needs_evidence'
}

export function evaluateCompletionReadiness(facts: ReadinessFacts, projectId: string): ReadinessSummary {
  const base = `/projects/${projectId}`
  const items: ReadinessItem[] = []
  const { features } = facts

  if (!features.schedule) {
    items.push({ key: 'schedule_activities', label: 'Construction milestones', detail: 'Scheduling is turned off for this organization.', policy: 'not_applicable', state: 'not_applicable', href: null })
  } else if (facts.scheduleActivityCount === 0) {
    items.push({ key: 'schedule_recorded', label: 'Construction schedule', detail: 'No construction schedule is recorded for this project.', policy: 'overridable', state: 'needs_evidence', href: `${base}/schedule` })
  } else {
    items.push({
      key: 'schedule_activities',
      label: 'Construction milestones',
      detail: facts.scheduleIncompleteCount === 0
        ? 'All scheduled activities are completed or marked not applicable.'
        : `${plural(facts.scheduleIncompleteCount, 'activity is', 'activities are')} not completed.`,
      policy: 'overridable',
      state: facts.scheduleIncompleteCount === 0 ? 'verified' : 'incomplete',
      href: `${base}/schedule`,
    })
  }

  items.push(
    facts.inspectionCount === 0
      ? { key: 'inspections', label: 'Inspections', detail: 'No inspections are tracked in the schedule. Confirm required inspections and occupancy outside the app.', policy: 'advisory', state: 'needs_evidence', href: features.schedule ? `${base}/schedule` : null }
      : {
          key: 'inspections',
          label: 'Inspections',
          detail: facts.inspectionsOutstandingCount === 0
            ? 'All tracked inspections are recorded as passed. This record does not replace official approval documents.'
            : `${plural(facts.inspectionsOutstandingCount, 'inspection is', 'inspections are')} not recorded as passed. Inspections cannot be waived.`,
          policy: 'required',
          state: facts.inspectionsOutstandingCount === 0 ? 'verified' : 'incomplete',
          href: `${base}/schedule`,
        },
  )

  items.push({
    key: 'punch_list',
    label: 'Punch list',
    detail: facts.openPunchItemCount === 0 ? 'No open punch-list items.' : `${plural(facts.openPunchItemCount, 'item is', 'items are')} still open.`,
    policy: 'overridable',
    state: facts.openPunchItemCount === 0 ? 'verified' : 'incomplete',
    href: `${base}/walkthroughs`,
  })

  if (!features.walkthroughs) {
    items.push({ key: 'final_walkthrough', label: 'Final walkthrough', detail: 'Walkthroughs are turned off for this organization.', policy: 'not_applicable', state: 'not_applicable', href: null })
  } else if (!facts.finalWalkthroughSubmitted) {
    items.push({ key: 'final_walkthrough', label: 'Final walkthrough', detail: 'No submitted final walkthrough is recorded.', policy: 'overridable', state: 'incomplete', href: `${base}/walkthroughs` })
  } else {
    items.push({ key: 'final_walkthrough', label: 'Final walkthrough', detail: 'A final walkthrough has been submitted.', policy: 'overridable', state: 'verified', href: `${base}/walkthroughs` })
    items.push({
      key: 'builder_signoff',
      label: 'Builder sign-off',
      detail: facts.latestFinalSignoff === 'verified'
        ? 'The final walkthrough report is verified by the builder.'
        : facts.latestFinalSignoff === 'rejected'
          ? 'The latest builder review of the final walkthrough report was rejected.'
          : 'The final walkthrough report has no builder sign-off.',
      policy: 'overridable',
      state: facts.latestFinalSignoff === 'verified' ? 'verified' : 'incomplete',
      href: `${base}/walkthroughs`,
    })
    items.push({
      key: 'homeowner_acknowledgment',
      label: 'Homeowner acknowledgment',
      detail: facts.homeownerAcknowledged ? 'The homeowner acknowledged the final walkthrough report.' : 'The homeowner has not acknowledged the final walkthrough report.',
      policy: 'advisory',
      state: facts.homeownerAcknowledged ? 'verified' : 'needs_evidence',
      href: `${base}/walkthroughs`,
    })
  }

  items.push({
    key: 'homeowner_linked',
    label: 'Homeowner handover',
    detail: facts.homeownerCount === 0 ? 'No homeowner is linked to receive the handover.' : `${plural(facts.homeownerCount, 'homeowner is', 'homeowners are')} linked to the project.`,
    policy: 'overridable',
    state: facts.homeownerCount === 0 ? 'incomplete' : 'verified',
    href: base,
  })

  if (features.documents && features.e_signatures) {
    items.push({
      key: 'signatures',
      label: 'Documents & signatures',
      detail: facts.pendingSignatureCount === 0 ? 'No signature requests are waiting.' : `${plural(facts.pendingSignatureCount, 'signature request is', 'signature requests are')} still waiting.`,
      policy: 'advisory',
      state: facts.pendingSignatureCount === 0 ? 'verified' : 'incomplete',
      href: `${base}/documents`,
    })
  }

  if (facts.outstandingInvoiceCount !== null || facts.pendingChangeOrderCount !== null) {
    const invoices = facts.outstandingInvoiceCount ?? 0
    const changes = facts.pendingChangeOrderCount ?? 0
    const parts = [invoices > 0 && plural(invoices, 'invoice is', 'invoices are') + ' unpaid', changes > 0 && plural(changes, 'change order is', 'change orders are') + ' pending'].filter(Boolean)
    items.push({
      key: 'financial_review',
      label: 'Financial review',
      detail: parts.length === 0 ? 'No unpaid invoices or pending change orders.' : `${parts.join('; ')}. Financial settlement is tracked separately from completion.`,
      policy: 'advisory',
      state: parts.length === 0 ? 'verified' : 'incomplete',
      href: `${base}/financials`,
    })
  }

  items.push(
    features.warranty
      ? { key: 'warranty_setup', label: 'Warranty setup', detail: 'Warranty coverage starts on the completion date you enter, using the organization’s default warranty terms.', policy: 'advisory', state: 'verified', href: null }
      : { key: 'warranty_setup', label: 'Warranty setup', detail: 'Warranty tracking is turned off for this organization.', policy: 'not_applicable', state: 'not_applicable', href: null },
  )

  return summarize(items)
}

export function summarize(items: ReadinessItem[]): ReadinessSummary {
  const applicable = items.filter((i) => i.policy !== 'not_applicable')
  const gating = applicable.filter((i) => i.policy === 'required' || i.policy === 'overridable')
  const blockers = gating.filter(isUnmet)
  const hardBlockers = blockers.filter((i) => i.policy === 'required')
  const warnings = applicable.filter((i) => i.policy === 'advisory' && isUnmet(i))
  const overall: ReadinessOverall = hardBlockers.length > 0 ? 'blocked' : blockers.length > 0 ? 'needs_exceptions' : 'ready'
  return {
    items,
    overall,
    applicableCount: applicable.length,
    satisfiedCount: applicable.filter((i) => i.state === 'verified' || i.state === 'exception_approved').length,
    blockers,
    hardBlockers,
    warnings,
    nextAction: hardBlockers[0] ?? blockers[0] ?? warnings[0] ?? null,
  }
}

export const READINESS_STATE_LABELS: Record<ReadinessState, string> = {
  verified: 'Verified',
  incomplete: 'Incomplete',
  needs_evidence: 'Needs evidence',
  not_applicable: 'Not applicable',
  exception_approved: 'Exception approved',
}

export const READINESS_POLICY_LABELS: Record<ReadinessPolicy, string> = {
  required: 'Required',
  overridable: 'Required · exception allowed',
  advisory: 'Advisory',
  not_applicable: 'Not applicable',
}

const WEAK_JUSTIFICATIONS = new Set(['n/a', 'na', 'skip', 'none', 'not applicable'])

export function isSubstantiveJustification(text: string): boolean {
  const t = text.trim()
  return t.length >= 20 && !WEAK_JUSTIFICATIONS.has(t.toLowerCase())
}

/** Statuses where readiness is worth surfacing on the overview. */
export function showsCompletionReadiness(status: string): boolean {
  return status === 'under_construction' || status === 'punch_list' || status === 'final_inspection'
}
