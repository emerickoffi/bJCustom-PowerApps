/** Pure rules for the dashboard "Getting started" checklist shown to company administrators. */

export type GettingStartedInput = {
  /** A live (not archived) sample project exists. */
  sampleProjectId: string | null
  /** A sample project was ever created, even if it has since been archived. */
  sampleEverLoaded: boolean
  hasLogo: boolean
  hasContactDetails: boolean
  /** The admin has changed at least one module switch from its default. */
  reviewedModules: boolean
  realProjectCount: number
  staffMemberCount: number
  pendingStaffInvites: number
  hasSubscription: boolean
  dismissed: boolean
}

export type ChecklistStepId = 'sample' | 'company' | 'modules' | 'project' | 'team' | 'plan'

export type ChecklistStep = {
  id: ChecklistStepId
  title: string
  description: string
  href: string | null
  cta: string
  done: boolean
}

export type Checklist = {
  steps: ChecklistStep[]
  doneCount: number
  /** Show the card at all. Hidden when dismissed or every step is done. */
  visible: boolean
}

export function buildChecklist(input: GettingStartedInput): Checklist {
  const steps: ChecklistStep[] = [
    {
      id: 'sample',
      title: 'Explore the sample project',
      description: 'See a job in progress, with its estimate, schedule, daily logs, change order and draws.',
      href: input.sampleProjectId ? `/projects/${input.sampleProjectId}` : null,
      cta: input.sampleProjectId ? 'Open sample' : 'Add sample project',
      done: input.sampleEverLoaded,
    },
    {
      id: 'company',
      title: 'Add your company details and logo',
      description: 'Your logo and contact details appear on estimates, invoices and the client portal.',
      href: '/settings',
      cta: 'Company settings',
      done: input.hasLogo && input.hasContactDetails,
    },
    {
      id: 'modules',
      title: 'Turn on the modules you use',
      description: 'Daily logs, change orders, invoices, documents and more can be switched on or off for your team.',
      href: '/settings/features',
      cta: 'Choose modules',
      done: input.reviewedModules,
    },
    {
      id: 'project',
      title: 'Create your first real project',
      description: 'Add a client and a job you are working on now.',
      href: '/projects/new',
      cta: 'New project',
      done: input.realProjectCount > 0,
    },
    {
      id: 'team',
      title: 'Invite your team',
      description: 'Add project managers and field staff so they can log work from the jobsite.',
      href: '/team',
      cta: 'Invite people',
      done: input.staffMemberCount > 1 || input.pendingStaffInvites > 0,
    },
    {
      id: 'plan',
      title: 'Choose a plan',
      description: 'Pick a plan before your trial ends to keep working without interruption.',
      href: '/billing',
      cta: 'See plans',
      done: input.hasSubscription,
    },
  ]
  const doneCount = steps.filter((s) => s.done).length
  return { steps, doneCount, visible: !input.dismissed && doneCount < steps.length }
}
