export type NextActionTone = 'critical' | 'review' | 'setup'

export type NextAction = {
  key: string
  tone: NextActionTone
  title: string
  description: string
  href: string
  actionLabel: string
}

export type SignatureRequestRef = { document_id: string; status: string; created_at: string }

export type ProjectActionState = {
  projectId: string
  canManage: boolean
  features: { schedule: boolean; estimates: boolean; documents: boolean; e_signatures: boolean; walkthroughs: boolean }
  hasProjectManager: boolean
  activityCount: number
  /** Open activities marked delayed or still open after their planned finish. */
  lateActivityCount: number
  reviewEstimateIds: string[]
  signatureRequests: SignatureRequestRef[]
  openIssueCount: number
  firstOpenIssueId: string | null
}

export const NEXT_ACTION_LIMIT = 3

const AWAITING_SIGNATURE = new Set(['awaiting_signatures', 'partially_signed'])
const SIGNATURE_PROBLEM = new Set(['declined', 'failed', 'expired'])

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Only the newest request per document reflects its current signing state. */
export function latestSignatureRequests(requests: SignatureRequestRef[]): SignatureRequestRef[] {
  const latest = new Map<string, SignatureRequestRef>()
  for (const r of requests) {
    const current = latest.get(r.document_id)
    if (!current || r.created_at > current.created_at) latest.set(r.document_id, r)
  }
  return [...latest.values()]
}

/** Prioritized next steps derived from the project's actual records, limited to what the user can act on. */
export function buildProjectNextActions(state: ProjectActionState): { items: NextAction[]; hiddenCount: number } {
  const base = `/projects/${encodeURIComponent(state.projectId)}`
  const { features, canManage } = state
  const actions: NextAction[] = []
  const signing = features.documents && features.e_signatures
  const signatures = signing ? latestSignatureRequests(state.signatureRequests) : []

  if (features.schedule && state.lateActivityCount > 0) {
    actions.push({
      key: 'late-activities',
      tone: 'critical',
      title: `${plural(state.lateActivityCount, 'activity needs', 'activities need')} an update`,
      description: 'Delayed or past the planned finish. Update progress, status, or dates.',
      href: `${base}/schedule`,
      actionLabel: 'Update schedule',
    })
  }

  const problems = signatures.filter((s) => SIGNATURE_PROBLEM.has(s.status)).length
  if (canManage && problems > 0) {
    actions.push({
      key: 'signature-problems',
      tone: 'critical',
      title: `${plural(problems, 'signature request needs', 'signature requests need')} attention`,
      description: 'Declined, expired, or failed. Review the document and send a new request if needed.',
      href: `${base}/documents`,
      actionLabel: 'Review signatures',
    })
  }

  if (canManage && !state.hasProjectManager) {
    actions.push({
      key: 'assign-manager',
      tone: 'setup',
      title: 'Assign a project manager',
      description: 'No project manager is assigned to this project yet.',
      href: `${base}/edit`,
      actionLabel: 'Assign manager',
    })
  }

  if (features.estimates && canManage && state.reviewEstimateIds.length > 0) {
    const one = state.reviewEstimateIds.length === 1
    actions.push({
      key: 'estimate-review',
      tone: 'review',
      title: `${plural(state.reviewEstimateIds.length, 'estimate is', 'estimates are')} in internal review`,
      description: 'Return to draft or submit for homeowner review.',
      href: one
        ? `/estimates/${encodeURIComponent(state.reviewEstimateIds[0])}`
        : `/estimates?project=${encodeURIComponent(state.projectId)}`,
      actionLabel: one ? 'Review estimate' : 'Review estimates',
    })
  }

  if (features.walkthroughs && state.openIssueCount > 0) {
    const one = state.openIssueCount === 1 && state.firstOpenIssueId
    actions.push({
      key: 'open-issues',
      tone: 'review',
      title: `${plural(state.openIssueCount, 'walkthrough issue is', 'walkthrough issues are')} open`,
      description: 'Record corrective work and approve repairs for homeowner confirmation.',
      href: one ? `${base}/issues/${encodeURIComponent(state.firstOpenIssueId!)}` : `${base}#walkthroughs-heading`,
      actionLabel: one ? 'Open issue' : 'View issues',
    })
  }

  const awaiting = signatures.filter((s) => AWAITING_SIGNATURE.has(s.status)).length
  if (awaiting > 0) {
    actions.push({
      key: 'signatures-pending',
      tone: 'review',
      title: `${plural(awaiting, 'document is', 'documents are')} awaiting signatures`,
      description: 'Track who has signed and who is still pending.',
      href: `${base}/documents`,
      actionLabel: 'Track signatures',
    })
  }

  if (features.schedule && canManage && state.activityCount === 0) {
    actions.push({
      key: 'schedule-setup',
      tone: 'setup',
      title: 'Set up the construction schedule',
      description: 'Progress tracking starts once the schedule is initialized.',
      href: `${base}/schedule`,
      actionLabel: 'Set up schedule',
    })
  }

  return { items: actions.slice(0, NEXT_ACTION_LIMIT), hiddenCount: Math.max(0, actions.length - NEXT_ACTION_LIMIT) }
}

export type HomeownerAction = { key: string; title: string; description: string; project: string; href: string; actionLabel: string }

export type HomeownerActionInput = {
  projects: { id: string; name: string }[]
  features: { walkthroughs: boolean; documents: boolean; e_signatures: boolean }
  walkthroughs: { id: string; project_id: string; title: string; status: string }[]
  repairsAwaitingConfirmation: { id: string; project_id: string; walkthrough_id: string; item_label: string }[]
  signatureTasks: { projectId: string; signerId: string; documentName: string; status: string; requestStatus: string; waitingReason: string | null }[]
}

/** Homeowner to-dos backed by records the homeowner can already open in the portal. */
export function buildHomeownerActions(input: HomeownerActionInput): HomeownerAction[] {
  const names = new Map(input.projects.map((p) => [p.id, p.name]))
  const actions: HomeownerAction[] = []

  if (input.features.documents && input.features.e_signatures) {
    for (const t of input.signatureTasks) {
      if (!AWAITING_SIGNATURE.has(t.requestStatus) || t.status === 'signed' || t.status === 'declined') continue
      if (!names.has(t.projectId)) continue
      actions.push({
        key: `sig-${t.signerId}`,
        title: `Sign ${t.documentName}`,
        description: t.waitingReason ?? 'Ready for your signature.',
        project: names.get(t.projectId)!,
        href: `/portal/projects/${encodeURIComponent(t.projectId)}/documents#sign-${encodeURIComponent(t.signerId)}`,
        actionLabel: 'Review and sign',
      })
    }
  }

  if (input.features.walkthroughs) {
    for (const r of input.repairsAwaitingConfirmation) {
      if (!names.has(r.project_id)) continue
      actions.push({
        key: `repair-${r.id}`,
        title: `Confirm repair: ${r.item_label}`,
        description: 'Your builder marked this repaired. Accept it or tell them what still needs work.',
        project: names.get(r.project_id)!,
        href: `/portal/walkthroughs/${encodeURIComponent(r.walkthrough_id)}#issue-${encodeURIComponent(r.id)}`,
        actionLabel: 'Review repair',
      })
    }
    for (const w of input.walkthroughs) {
      if (w.status === 'submitted' || !names.has(w.project_id)) continue
      actions.push({
        key: `walk-${w.id}`,
        title: `Complete walkthrough: ${w.title}`,
        description: 'Go through the checklist and submit your report.',
        project: names.get(w.project_id)!,
        href: `/portal/walkthroughs/${encodeURIComponent(w.id)}`,
        actionLabel: 'Open walkthrough',
      })
    }
  }

  return actions
}
