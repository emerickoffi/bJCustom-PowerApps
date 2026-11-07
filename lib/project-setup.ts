/** `null` means the underlying records could not be loaded, so completion is unknown rather than missing. */
export type SetupFact = boolean | null

export type SetupStepState = 'done' | 'todo' | 'unknown'

export type SetupStep = { key: string; label: string; detail: string; state: SetupStepState; href: string; actionLabel: string }

export type ProjectSetupInput = {
  projectId: string
  features: { schedule: boolean; documents: boolean; estimates: boolean }
  hasProjectManager: SetupFact
  hasHomeowner: SetupFact
  hasTeam: SetupFact
  hasSchedule: SetupFact
  hasDocuments: SetupFact
  hasEstimate: SetupFact
  /** Anchor of the overview's team card, where homeowners are linked. */
  teamAnchor: string
}

const toState = (fact: SetupFact): SetupStepState => (fact === null ? 'unknown' : fact ? 'done' : 'todo')

/** Setup progress derived only from existing records; steps for disabled modules are omitted. */
export function buildProjectSetup(input: ProjectSetupInput): { steps: SetupStep[]; doneCount: number; complete: boolean } {
  const base = `/projects/${encodeURIComponent(input.projectId)}`
  const steps: SetupStep[] = [
    {
      key: 'manager',
      label: 'Assign project manager',
      detail: 'Owns reviews, approvals, and schedule updates.',
      state: toState(input.hasProjectManager),
      href: `${base}/edit`,
      actionLabel: 'Assign',
    },
    {
      key: 'homeowner',
      label: 'Link homeowner',
      detail: 'Gives the homeowner portal access to this project.',
      state: toState(input.hasHomeowner),
      href: `${base}#${input.teamAnchor}`,
      actionLabel: 'Link',
    },
    {
      key: 'team',
      label: 'Add team',
      detail: 'Staff members or directory contacts working on this job.',
      state: toState(input.hasTeam),
      href: `${base}/contacts/add`,
      actionLabel: 'Add',
    },
  ]
  if (input.features.schedule)
    steps.push({
      key: 'schedule',
      label: 'Establish schedule',
      detail: 'Construction progress is calculated from schedule activities.',
      state: toState(input.hasSchedule),
      href: `${base}/schedule`,
      actionLabel: 'Set up',
    })
  if (input.features.documents)
    steps.push({
      key: 'documents',
      label: 'Add initial documents',
      detail: 'Plans, permits, and contracts.',
      state: toState(input.hasDocuments),
      href: `${base}/documents`,
      actionLabel: 'Upload',
    })
  if (input.features.estimates)
    steps.push({
      key: 'estimate',
      label: 'Create first estimate',
      detail: 'Start pricing the work for homeowner review.',
      state: toState(input.hasEstimate),
      href: `/estimates/new?project=${encodeURIComponent(input.projectId)}`,
      actionLabel: 'Create',
    })
  const doneCount = steps.filter((s) => s.state === 'done').length
  return { steps, doneCount, complete: doneCount === steps.length }
}

export const setupDismissCookie = (projectId: string) => `setup-dismissed-${projectId}`
