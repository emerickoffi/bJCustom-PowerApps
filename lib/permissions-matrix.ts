import type { FeatureKey } from '@/lib/feature-registry'
import type { OrgRole } from '@/lib/domain'

export type Access = 'allowed' | 'conditional' | 'denied' | 'unverified'

export type Cell = { state: Access; why?: string }

export type MatrixAction = {
  action: string
  access: Record<OrgRole, Cell>
  /** What each role sees while the module's feature is turned off. Defaults to Not allowed. */
  whenOff?: Partial<Record<OrgRole, Cell>>
}

export type MatrixModule = {
  id: string
  module: string
  feature?: FeatureKey
  /** Server-side guard functions that run before the page or action. */
  guard: string
  /** Live Supabase RLS behaviour the cells rely on. */
  database: string
  actions: MatrixAction[]
}

export const MATRIX_ROLES: OrgRole[] = ['org_admin', 'project_manager', 'builder_staff', 'client']

export const ACCESS_DEFINITIONS: Record<Access, string> = {
  allowed: 'This role may perform this action when all applicable security conditions are met.',
  conditional:
    "Access depends on the user's organization, project authorization, feature availability, or record visibility.",
  denied: 'Explicitly denied by the enforced authorization rules.',
  unverified: 'Effective enforcement has not yet been fully verified.',
}

const ok = (why?: string): Cell => ({ state: 'allowed', why })
const cond = (why: string): Cell => ({ state: 'conditional', why })
const no = (why?: string): Cell => ({ state: 'denied', why })
const unverified = (why: string): Cell => ({ state: 'unverified', why })

const roles = (admin: Cell, pm: Cell, staff: Cell, home: Cell): Record<OrgRole, Cell> => ({
  org_admin: admin,
  project_manager: pm,
  builder_staff: staff,
  client: home,
})

const COMPANY_WIDE = 'Every project in their own company. Other companies are always denied by the database.'
const ASSIGNED =
  'Only on projects where they are the project manager of record or a listed project member. Enforced by the database; other project URLs show Not found.'
const GRANTED =
  "Only on projects they've been granted portal access to, while their client is linked to the project and it isn't archived. The Homeowner portal must be on."
const PORTAL_ONLY = 'Homeowners are confined to the portal; staff pages redirect them.'
const MANAGER_WRITE = 'The server action requires a manager, and the database rejects writes from this role.'

// Each cell reflects the server guard plus the live Supabase RLS policies (inspected via pg_policies and the
// can_view_project_internal / is_project_homeowner helpers). Update a cell only with matching evidence.
export const PERMISSIONS_MATRIX: MatrixModule[] = [
  {
    id: 'company',
    module: 'Company settings, Features & Integrations',
    guard: 'requireAdmin',
    database: 'organizations and organization_features: updates require is_org_admin.',
    actions: [
      { action: 'View', access: roles(ok(), no('Redirected by requireAdmin.'), no('Redirected by requireAdmin.'), no(PORTAL_ONLY)) },
      {
        action: 'Edit',
        access: roles(ok('The database also requires an administrator.'), no(), no(), no(PORTAL_ONLY)),
      },
    ],
  },
  {
    id: 'users',
    module: 'Users & Access',
    guard: 'requireAdmin',
    database: 'portal_accounts and portal_project_access: insert, update, and delete require is_org_admin.',
    actions: [
      { action: 'View staff & homeowner accounts', access: roles(ok(), no(), no(), no(PORTAL_ONLY)) },
      { action: 'Change role / suspend', access: roles(ok(), no(), no(), no(PORTAL_ONLY)) },
      {
        action: 'Grant homeowner portal & project access',
        access: roles(ok('The database also requires an administrator.'), no(), no(), no(PORTAL_ONLY)),
      },
    ],
  },
  {
    id: 'clients',
    module: 'Clients & contacts',
    guard: 'requireStaff · requireManager',
    database: 'clients: managers read all; staff read clients linked to visible projects; writes require is_org_manager.',
    actions: [
      {
        action: 'View',
        access: roles(
          ok('All clients in their company.'),
          ok('All clients in their company.'),
          cond('Only clients linked to a project they are assigned to. Enforced by the database.'),
          no('Staff pages redirect homeowners. In the portal they can read only their own client record.'),
        ),
      },
      { action: 'Create / edit', access: roles(ok(), ok(), no(MANAGER_WRITE), no(PORTAL_ONLY)) },
    ],
  },
  {
    id: 'projects',
    module: 'Projects',
    guard: 'requireStaff · requireManager',
    database: 'projects: managers read the whole company; staff read assigned projects; homeowners read granted projects.',
    actions: [
      {
        action: 'View',
        access: roles(
          ok(COMPANY_WIDE),
          ok(`${COMPANY_WIDE} Not limited to the projects they manage.`),
          cond(ASSIGNED),
          cond(GRANTED),
        ),
      },
      { action: 'Create / edit', access: roles(ok(), ok(), no(MANAGER_WRITE), no(PORTAL_ONLY)) },
    ],
  },
  {
    id: 'schedule',
    module: 'Schedule',
    feature: 'schedule',
    guard: 'requireFeature · requireStaff · requireManager',
    database: 'schedule_activities: read and progress updates require project visibility; plan changes require a manager.',
    actions: [
      {
        action: 'View',
        access: roles(
          ok(COMPANY_WIDE),
          ok(COMPANY_WIDE),
          cond(ASSIGNED),
          cond(`Only activities marked Published. ${GRANTED}`),
        ),
      },
      {
        action: 'Edit plan, tasks & dependencies',
        access: roles(ok(), ok(), no('Every plan-editing server action requires a manager.'), no(PORTAL_ONLY)),
      },
      {
        action: 'Update progress',
        access: roles(ok(), ok(), cond(ASSIGNED), no(PORTAL_ONLY)),
      },
    ],
  },
  {
    id: 'estimates',
    module: 'Estimates',
    feature: 'estimates',
    guard: 'requireFeature · requireStaff · requireManager',
    database: 'estimates: read requires project visibility; writes require is_org_manager.',
    actions: [
      {
        action: 'View',
        access: roles(
          ok(COMPANY_WIDE),
          ok(COMPANY_WIDE),
          cond(ASSIGNED),
          no('No database policy lets homeowners read estimates. Estimates sent for signature reach them through Documents.'),
        ),
      },
      { action: 'Create / edit', access: roles(ok(), ok(), no(MANAGER_WRITE), no(PORTAL_ONLY)) },
    ],
  },
  {
    id: 'invoices',
    module: 'Invoices',
    feature: 'invoices',
    guard: 'requireStaff · getInvoiceAccess · requireInvoiceManager',
    database: 'invoices: managers read their company; homeowners read issued, portal-published invoices; staff have no read policy.',
    actions: [
      {
        action: 'View',
        access: roles(
          ok(COMPANY_WIDE),
          ok(COMPANY_WIDE),
          no('The database returns no invoices to Builder Staff. The Invoices page still opens for them, but it is always empty.'),
          cond(`Only issued invoices published to the portal; drafts are never visible. ${GRANTED}`),
        ),
        whenOff: {
          org_admin: ok('While Invoices is turned off, administrators keep read-only access to existing invoices and payments.'),
        },
      },
      { action: 'Create / edit / record payments', access: roles(ok(), ok(), no(MANAGER_WRITE), no(PORTAL_ONLY)) },
    ],
  },
  {
    id: 'documents',
    module: 'Documents',
    feature: 'documents',
    guard: 'requireFeature · requireDocumentsStaff · canManage',
    database: 'project_documents: company library needs a manager; project files need project visibility; homeowners read Shared files only.',
    actions: [
      {
        action: 'View / download',
        access: roles(
          ok('Company library and every project document.'),
          ok('Company library and every project document.'),
          cond(`Project documents only; the company library is limited to managers. ${ASSIGNED}`),
          cond(`Only project documents marked Shared and not archived. ${GRANTED}`),
        ),
      },
      {
        action: 'Upload / edit details',
        access: roles(
          ok(),
          ok(),
          cond(`${ASSIGNED} Checked by the server action before the file is stored; there is no separate database write policy.`),
          no(PORTAL_ONLY),
        ),
      },
      { action: 'Share with homeowner', access: roles(ok(), ok(), no('The server action requires a manager.'), no(PORTAL_ONLY)) },
      { action: 'Archive', access: roles(ok(), ok(), no('The server action requires a manager.'), no(PORTAL_ONLY)) },
      {
        action: 'Request e-signatures',
        access: roles(
          ok('Electronic signatures must also be on.'),
          ok('Electronic signatures must also be on.'),
          no('The server action requires an administrator or project manager.'),
          no(PORTAL_ONLY),
        ),
      },
      {
        action: 'Sign documents sent to them',
        access: roles(
          unverified('Signers are matched by user account. Whether staff can be added as signers was not checked.'),
          unverified('Signers are matched by user account. Whether staff can be added as signers was not checked.'),
          unverified('Signers are matched by user account. Whether staff can be added as signers was not checked.'),
          cond('Only requests that list them as a signer, while Electronic signatures is on. Enforced by the database.'),
        ),
      },
    ],
  },
  {
    id: 'warranty',
    module: 'Warranty',
    feature: 'warranty',
    guard: 'requireFeature · requireStaff · requireAdmin',
    database: 'warranty tables: read requires project visibility or a portal grant; templates and coverage rules require is_org_admin.',
    actions: [
      {
        action: 'View coverage, milestones & claims',
        access: roles(
          ok(COMPANY_WIDE),
          ok(COMPANY_WIDE),
          cond(ASSIGNED),
          cond(`Claim updates only when marked Shared. ${GRANTED}`),
        ),
      },
      {
        action: 'Update follow-ups',
        access: roles(ok(), ok(), cond(ASSIGNED), no(PORTAL_ONLY)),
      },
      {
        action: 'Enroll / correct / archive, templates',
        access: roles(
          ok('Templates and coverage rules also require an administrator in the database.'),
          no('The server action requires an administrator.'),
          no('The server action requires an administrator.'),
          no(PORTAL_ONLY),
        ),
      },
    ],
  },
  {
    id: 'walkthroughs',
    module: 'Walkthroughs',
    feature: 'walkthroughs',
    guard: 'requireFeature · requireManager · requireHomeowner',
    database: 'walkthroughs: read requires project visibility or a portal grant; create and update require is_org_manager.',
    actions: [
      {
        action: 'View',
        access: roles(ok(COMPANY_WIDE), ok(COMPANY_WIDE), cond(ASSIGNED), cond(GRANTED)),
      },
      { action: 'Create & edit checklists', access: roles(ok(), ok(), no(MANAGER_WRITE), no(PORTAL_ONLY)) },
      {
        action: 'Complete & submit',
        access: roles(
          no('Only homeowners complete walkthroughs.'),
          no('Only homeowners complete walkthroughs.'),
          no('Only homeowners complete walkthroughs.'),
          cond(GRANTED),
        ),
      },
    ],
  },
  {
    id: 'reports',
    module: 'Walkthrough reports',
    feature: 'reports',
    guard: 'requireFeature · requireManager',
    database: 'walkthrough_reports: create requires a manager; homeowners read published reports with the View reports permission.',
    actions: [
      { action: 'Generate & publish', access: roles(ok(), ok(), no(MANAGER_WRITE), no(PORTAL_ONLY)) },
      {
        action: 'View reports',
        access: roles(
          ok(COMPANY_WIDE),
          ok(COMPANY_WIDE),
          cond(ASSIGNED),
          cond(`Published reports only, and their contact needs the View reports permission. ${GRANTED}`),
        ),
      },
      {
        action: 'Acknowledge a report',
        access: roles(
          no('Acknowledgments are recorded for homeowners only.'),
          no('Acknowledgments are recorded for homeowners only.'),
          no('Acknowledgments are recorded for homeowners only.'),
          cond(`Published reports only. ${GRANTED}`),
        ),
      },
    ],
  },
]

export type RoleDetail = { summary: string; scope: string; gaps: string[] }

export const ROLE_DETAILS: Record<OrgRole, RoleDetail> = {
  org_admin: {
    summary: 'Runs the company account: settings, features, users, homeowner portal access, and every module.',
    scope: COMPANY_WIDE,
    gaps: ['E-signature signer eligibility for staff accounts has not been verified.'],
  },
  project_manager: {
    summary:
      'Manages clients, projects, schedules, estimates, invoices, documents, walkthroughs, and reports. Cannot change company settings, users, or warranty enrollment.',
    scope: `${COMPANY_WIDE} This is company-wide by design in the current database policies, not limited to assigned projects.`,
    gaps: ['E-signature signer eligibility for staff accounts has not been verified.'],
  },
  builder_staff: {
    summary: 'Field and office staff. Views and updates work on the projects they are assigned to; cannot create or approve records.',
    scope: ASSIGNED,
    gaps: [
      'The Invoices page opens for this role but the database returns nothing, so it always shows empty.',
      'Document uploads are limited to assigned projects by the server action only; the database has no write policy for documents.',
      'E-signature signer eligibility for staff accounts has not been verified.',
    ],
  },
  client: {
    summary:
      'Homeowners use the separate portal. They never see internal pages, financial drafts, internal documents, or other homeowners’ data.',
    scope: GRANTED,
    gaps: [],
  },
}
