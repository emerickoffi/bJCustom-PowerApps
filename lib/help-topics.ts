// What the ? Help panel says on each screen. Pure, so node --test can load it directly.

export type HelpArea = 'staff' | 'portal' | 'sub' | 'public'

export type HelpTopic = {
  title: string
  tips: string[]
}

export const SUPPORT_EMAIL = 'support@trefortpro.com'
export const SUPPORT_RESPONSE_PROMISE = 'We reply within 1 business day, usually much sooner.'

type Rule = { area: HelpArea; match: RegExp; topic: HelpTopic }

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

/** First match wins, so the more specific paths come first. */
const RULES: Rule[] = [
  // ───────── Staff app ─────────
  {
    area: 'staff',
    match: /\/estimates(\/|$)/,
    topic: {
      title: 'Estimates',
      tips: [
        'If an estimate will not save, look for a field marked in red or a message at the top of the form.',
        'If Trefort says someone else changed the estimate, reload the page to see their version, then make your change again.',
        'On a weak signal, wait for the save to finish before you leave the page.',
        'An estimate sent for client review is locked. Create a revision to change it.',
      ],
    },
  },
  {
    area: 'staff',
    match: /\/schedule(\/|$)/,
    topic: {
      title: 'Schedule',
      tips: [
        'Only activities marked as shared appear in the homeowner portal.',
        'Use the stage and status filters if an activity seems to be missing.',
      ],
    },
  },
  {
    area: 'staff',
    match: /\/daily-logs(\/|$)/,
    topic: {
      title: 'Daily logs',
      tips: [
        'Logs written offline send automatically once you are back online. The cloud icon at the top shows anything still waiting.',
      ],
    },
  },
  {
    area: 'staff',
    match: /^\/reports\/job-costing(\/|$)/,
    topic: {
      title: 'Job costing',
      tips: [
        'Each job uses the same numbers as its Financials tab. Click a job to see where they come from.',
        'Projected final cost is cost to date plus what is still committed or expected. Jobs heading over budget are listed first.',
        'A job without an approved estimate has no budget yet, so it is left out of the totals.',
        'Turn this report on or off in Settings → Feature management.',
      ],
    },
  },
  {
    area: 'staff',
    match: /^\/reports\/schedule(\/|$)/,
    topic: {
      title: 'Schedule report',
      tips: [
        'Behind schedule lists activities marked delayed or past their planned finish, most days late first.',
        'Coming up only shows activities with planned dates. Add dates on each project schedule to see them here.',
        'Use Print for the weekly meeting. The menus are left off the printout.',
      ],
    },
  },
  {
    area: 'staff',
    match: /^\/reports\/warranty(\/|$)/,
    topic: {
      title: 'Warranty report',
      tips: [
        'A claim is flagged when the homeowner has had no update in more than 14 days.',
        'Click a home to open its warranty and update the claim.',
        'Export downloads the same lists as spreadsheets.',
      ],
    },
  },
  {
    area: 'staff',
    match: /^\/exports(\/|$)/,
    topic: {
      title: 'Data exports',
      tips: [
        'Each download is a CSV file that opens in Excel, Google Sheets or Numbers.',
        'Files include everything in Trefort today, including archived records.',
        'Only administrators can download exports. Turn them on or off in Settings → Feature management.',
      ],
    },
  },
  {
    area: 'staff',
    match: /\/(invoices|change-orders)(\/|$)/,
    topic: {
      title: 'Invoices and change orders',
      tips: [
        'Drafts are only visible to your team. Homeowners see an invoice or change order once you send or publish it.',
        'Issued invoices cannot be deleted. Void one instead if it was sent by mistake.',
      ],
    },
  },
  {
    area: 'staff',
    match: /\/(team|subcontractors)(\/|$)/,
    topic: {
      title: 'Inviting people',
      tips: [
        'Invitations go to the email address you enter. Ask the person to check their spam folder for a message from Trefort.',
        'Invitations expire. If one has expired, send a new one.',
        'Subcontractors get a temporary password from you, not by email. If it has expired, issue a new one from the subcontractor page.',
      ],
    },
  },
  {
    area: 'staff',
    match: /^\/settings(\/|$)/,
    topic: {
      title: 'Company settings',
      tips: [
        'Only company admins can change settings.',
        'Under Support access you can let Trefort support view one project, read-only, for a short time.',
      ],
    },
  },
  {
    area: 'staff',
    match: new RegExp(`^/projects/${UUID}`),
    topic: {
      title: 'This project',
      tips: [
        'Use the tabs to move between schedule, documents, issues and money for this job.',
        'If something looks missing, check that the module is turned on under Settings → Feature management.',
      ],
    },
  },
  {
    area: 'staff',
    match: /.*/,
    topic: {
      title: 'Getting around Trefort',
      tips: [
        'Use the job switcher at the top to jump to a project.',
        'The + button creates estimates, logs, issues and more from anywhere.',
        'Trying Trefort on a real job for the first time? Tell us what you are setting up and we will help you get it right.',
      ],
    },
  },

  // ───────── Homeowner portal ─────────
  {
    area: 'portal',
    match: /\/(approvals|selections)(\/|$)/,
    topic: {
      title: 'Approvals and selections',
      tips: [
        'If something does not look right, ask your builder before you approve it.',
      ],
    },
  },
  {
    area: 'portal',
    match: /.*/,
    topic: {
      title: 'Your project portal',
      tips: [
        'Your builder decides what is shared here. If you expect to see something, ask them.',
        'Questions about your home, price or schedule go to your builder. Use Contact support for problems with Trefort itself.',
      ],
    },
  },

  // ───────── Subcontractor portal ─────────
  {
    area: 'sub',
    match: /.*/,
    topic: {
      title: 'Your trade partner workspace',
      tips: [
        'You see the work and quote requests the builder has sent to your company.',
        'If a job is missing, ask the builder to add your company to that project.',
      ],
    },
  },

  // ───────── Signed out ─────────
  {
    area: 'public',
    match: /^\/invite\//,
    topic: {
      title: 'Accepting an invitation',
      tips: [
        'Open the link from the newest invitation email you received.',
        'If the page says the invitation expired or was revoked, ask the person who invited you for a new one.',
        'Sign in with the same email address the invitation was sent to.',
      ],
    },
  },
  {
    area: 'public',
    match: /.*/,
    topic: {
      title: 'Signing in',
      tips: [
        'Use the email address your builder or company invited.',
        'Forgot your password? Use "Forgot password" on the sign-in page.',
        'Subcontractors: look for an email from Trefort saying a builder gave you access (check spam). The builder gives you a temporary password separately. If it has expired, ask them for a new one.',
      ],
    },
  },
]

export function helpTopicFor(area: HelpArea, pathname: string): HelpTopic {
  const path = pathname.replace(/[?#].*$/, '') || '/'
  return (RULES.find((r) => r.area === area && r.match.test(path)) ?? RULES.find((r) => r.area === area)!).topic
}

const STAFF_PROJECT = new RegExp(`^/projects/(${UUID})(/|$)`, 'i')
const PORTAL_PROJECT = new RegExp(`^/portal/projects/(${UUID})(/|$)`, 'i')

/** The project the person is looking at, if the address says so. The database re-checks it. */
export function projectIdFromPath(area: HelpArea, pathname: string): string | null {
  const re = area === 'staff' ? STAFF_PROJECT : area === 'portal' ? PORTAL_PROJECT : null
  return re?.exec(pathname)?.[1]?.toLowerCase() ?? null
}

/** Short, human summary of the browser for support, e.g. "Safari on iPhone". */
export function describeBrowser(userAgent: string): string {
  const ua = userAgent || ''
  const os = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Mac OS X/.test(ua)
          ? 'Mac'
          : /Windows/.test(ua)
            ? 'Windows'
            : 'unknown device'
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /CriOS|Chrome\//.test(ua)
      ? 'Chrome'
      : /FxiOS|Firefox\//.test(ua)
        ? 'Firefox'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'a browser'
  return `${browser} on ${os}`
}
