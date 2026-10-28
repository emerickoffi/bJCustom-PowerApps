import type { FeatureKey } from '@/lib/feature-registry'
import type { OrgRole } from '@/lib/domain'

export type Access = 'allowed' | 'shared_only' | 'denied' | 'review'

export type MatrixAction = {
  action: string
  access: Record<OrgRole, Access>
  note?: string
}

export type MatrixModule = {
  module: string
  feature?: FeatureKey
  guard: string
  actions: MatrixAction[]
}

export const MATRIX_ROLES: OrgRole[] = ['org_admin', 'project_manager', 'builder_staff', 'client']

const all = (a: Access, pm: Access, staff: Access, home: Access): Record<OrgRole, Access> => ({
  org_admin: a,
  project_manager: pm,
  builder_staff: staff,
  client: home,
})

// Every entry mirrors a guard verified in server code (lib/session.ts guards, server actions, portal layout).
// "review" means the server allows the role through and record scoping depends on RLS that hasn't been audited yet.
export const PERMISSIONS_MATRIX: MatrixModule[] = [
  {
    module: 'Company settings, Features & Integrations',
    guard: 'requireAdmin',
    actions: [
      { action: 'View', access: all('allowed', 'denied', 'denied', 'denied') },
      { action: 'Edit', access: all('allowed', 'denied', 'denied', 'denied') },
    ],
  },
  {
    module: 'Users & Access',
    guard: 'requireAdmin',
    actions: [
      { action: 'View staff & homeowner accounts', access: all('allowed', 'denied', 'denied', 'denied') },
      { action: 'Change role / suspend', access: all('allowed', 'denied', 'denied', 'denied') },
      { action: 'Provision portal access', access: all('allowed', 'denied', 'denied', 'denied') },
    ],
  },
  {
    module: 'Clients & contacts',
    guard: 'requireStaff · requireManager',
    actions: [
      { action: 'View', access: all('allowed', 'allowed', 'allowed', 'denied') },
      { action: 'Create / edit', access: all('allowed', 'allowed', 'denied', 'denied') },
    ],
  },
  {
    module: 'Projects',
    guard: 'requireStaff · requireManager',
    actions: [
      {
        action: 'View',
        access: all('allowed', 'review', 'review', 'shared_only'),
        note: 'Staff routes don’t check project assignment in app code. Homeowners only see projects they’ve been granted access to.',
      },
      { action: 'Create / edit', access: all('allowed', 'allowed', 'denied', 'denied') },
    ],
  },
  {
    module: 'Schedule',
    guard: 'requireStaff · requireManager',
    actions: [
      { action: 'View', access: all('allowed', 'allowed', 'review', 'shared_only') },
      { action: 'Edit tasks', access: all('allowed', 'allowed', 'denied', 'denied') },
    ],
  },
  {
    module: 'Estimates',
    guard: 'requireStaff · requireManager',
    actions: [
      { action: 'View', access: all('allowed', 'allowed', 'allowed', 'denied') },
      { action: 'Create / edit', access: all('allowed', 'allowed', 'denied', 'denied') },
    ],
  },
  {
    module: 'Invoices',
    guard: 'requireStaff · requireInvoiceManager',
    actions: [
      { action: 'View', access: all('allowed', 'allowed', 'allowed', 'shared_only') },
      { action: 'Create / edit', access: all('allowed', 'allowed', 'denied', 'denied') },
    ],
  },
  {
    module: 'Documents',
    feature: 'documents',
    guard: 'requireFeature · requireDocumentsStaff · canManage',
    actions: [
      { action: 'View / download', access: all('allowed', 'allowed', 'allowed', 'shared_only'), note: 'Homeowners only get documents marked “Shared” on projects they’ve been granted access to.' },
      { action: 'Upload / edit details', access: all('allowed', 'allowed', 'allowed', 'denied') },
      { action: 'Share with homeowner', access: all('allowed', 'allowed', 'denied', 'denied') },
      { action: 'Archive', access: all('allowed', 'allowed', 'denied', 'denied') },
    ],
  },
  {
    module: 'Warranty',
    feature: 'warranty',
    guard: 'requireFeature · requireStaff · requireAdmin',
    actions: [
      { action: 'View', access: all('allowed', 'allowed', 'allowed', 'shared_only') },
      { action: 'Update follow-ups', access: all('allowed', 'allowed', 'allowed', 'denied') },
      { action: 'Enroll / correct / archive', access: all('allowed', 'denied', 'denied', 'denied') },
    ],
  },
  {
    module: 'Walkthroughs',
    guard: 'requireManager · requireHomeowner',
    actions: [
      { action: 'Create', access: all('allowed', 'allowed', 'denied', 'denied') },
      { action: 'Review & sign', access: all('denied', 'denied', 'denied', 'shared_only') },
    ],
  },
  {
    module: 'Reports',
    guard: 'requireManager',
    actions: [{ action: 'Generate', access: all('allowed', 'allowed', 'denied', 'denied') }],
  },
]
