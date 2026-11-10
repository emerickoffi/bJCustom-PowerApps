'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { FormOverlay } from '@/components/shared/form-overlay'
import { FloatingActionStack, FloatingActionsProvider } from '@/components/app/floating-actions'
import { FloatingCameraProvider, useFloatingCameraTarget } from '@/components/camera/floating-camera'
import { AssistantProvider } from '@/components/assistant/assistant-context'
import { AssistantLauncher } from '@/components/assistant/assistant-launcher'
import { LayoutModeProvider } from '@/components/app/layout-mode'
import { TabletBottomNav } from '@/components/app/tablet-bottom-nav'
import { AssignSubcontractors, AssignSubcontractorsLink } from '@/components/projects/assign-subcontractors'
import { ProjectPeopleSummary } from '@/components/projects/project-people-summary'
import type { DirectoryRow } from '@/lib/directory-assignment-data'
import type { ProjectHomeowners } from '@/lib/project-homeowners-data'
import type { ProjectContact } from '@/lib/project-contacts-data'
import type { LayoutPreference } from '@/lib/ui-layout'

const PROJECTS = {
  p1: { id: '11111111-1111-4111-8111-111111111111', name: 'Maple Ridge Residence' },
  p2: { id: '22222222-2222-4222-8222-222222222222', name: 'Harbor View Remodel' },
} as const
type ProjectKey = keyof typeof PROJECTS

const person = (n: number, name: string, company: string, extra: Partial<DirectoryRow> = {}): DirectoryRow =>
  ({
    kind: 'person',
    key: `person:0000000${n}-0000-4000-8000-000000000000`,
    id: `0000000${n}-0000-4000-8000-000000000000`,
    name,
    email: `${name.split(' ')[0].toLowerCase()}@example.test`,
    emailEligibility: { eligible: false, reason: 'Email delivery is not configured.' },
    affiliations: [{ relationship_id: `a000000${n}-0000-4000-8000-000000000000`, company_name: company, position: 'Foreman', is_primary: true }],
    defaultRelationshipId: `a000000${n}-0000-4000-8000-000000000000`,
    suggestedRole: 'Subcontractor',
    account: 'not_provisioned',
    manageAccessHref: null,
    assigned: false,
    disabledReason: null,
    trade: 'Electrical',
    isSubcontractor: true,
    ...extra,
  }) as DirectoryRow

const company = (n: number, name: string, extra: Partial<DirectoryRow> = {}): DirectoryRow =>
  ({
    kind: 'company',
    key: `company:c000000${n}-0000-4000-8000-000000000000`,
    id: `c000000${n}-0000-4000-8000-000000000000`,
    name,
    email: null,
    peopleCount: 2,
    trade: 'Plumbing',
    assigned: false,
    disabledReason: null,
    isSubcontractor: true,
    ...extra,
  }) as DirectoryRow

const rowsFor = (key: ProjectKey): DirectoryRow[] => [
  person(1, 'Ana Ortiz', 'Northside Electrical'),
  person(2, 'Ben Carter', 'Northside Electrical'),
  person(3, 'Chloe Dunn', 'Summit Plumbing', { trade: 'Plumbing', assigned: key === 'p1' }),
  person(4, 'Dev Patel', 'Atlas Architects', { isSubcontractor: false, trade: null }),
  company(1, 'Northside Electrical', { trade: 'Electrical' }),
  company(2, 'Summit Plumbing'),
  company(3, 'Atlas Architects', { isSubcontractor: false, trade: null, disabledReason: 'Not a subcontractor company. Assign its people individually.' }),
]

const assignedContacts = [
  { association_id: 'x1', name: 'Chloe Dunn', project_role: 'Subcontractor', company_name: 'Summit Plumbing', status: 'active' },
] as unknown as ProjectContact[]

function CameraTarget() {
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)
  const inline = useRef<HTMLElement>(null)
  useFloatingCameraTarget({ label: 'Fixture photos', enabled: true, camera, gallery, inline })
  return null
}

export function AssignFixture({
  initialProject,
  layout,
  initialPeople,
  camera,
  assistant,
  assignable,
}: {
  initialProject: ProjectKey
  layout: LayoutPreference
  initialPeople: 'empty' | 'assigned'
  camera: boolean
  assistant: boolean
  assignable: boolean
}) {
  const [projectKey, setProjectKey] = useState<ProjectKey>(initialProject)
  const [people, setPeople] = useState(initialPeople)
  const [dialog, setDialog] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const [form, setForm] = useState(false)
  const project = PROJECTS[projectKey]

  // Lets the browser check drive what a route change or a post-save refresh would do while an overlay is open.
  useEffect(() => {
    const onProject = (e: Event) => setProjectKey((e as CustomEvent<ProjectKey>).detail)
    const onPeople = (e: Event) => setPeople((e as CustomEvent<'empty' | 'assigned'>).detail)
    window.addEventListener('fixture:project', onProject)
    window.addEventListener('fixture:people', onPeople)
    return () => {
      window.removeEventListener('fixture:project', onProject)
      window.removeEventListener('fixture:people', onPeople)
    }
  }, [])

  const content = (
    <div className="flex flex-col gap-6">
      <h1 data-fixture-project className="font-serif text-2xl font-semibold">
        {project.name}
      </h1>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setDialog(true)}>
          Open blocking dialog
        </Button>
        <Button variant="outline" onClick={() => setDrawer(true)}>
          Open drawer
        </Button>
        <Button variant="outline" onClick={() => setForm(true)}>
          Open form drawer
        </Button>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="surface p-4 text-sm text-muted-foreground">Schedule snapshot placeholder</div>
        <ProjectPeopleSummary
          projectId={project.id}
          homeowners={{ groups: [] } as unknown as ProjectHomeowners}
          managerName="Morgan Lee"
          members={[]}
          contacts={people === 'assigned' ? assignedContacts : []}
          companies={[]}
          assignAction={assignable ? <AssignSubcontractorsLink /> : null}
          assignNote={assignable ? null : 'This project is closed, so its directory can no longer change.'}
        />
      </div>
      {Array.from({ length: 14 }, (_, i) => (
        <div key={i} className="surface flex items-center justify-between gap-3 p-4 text-sm">
          <span>Filler row {i + 1}</span>
          <Button variant="outline" size="sm" data-fixture-row-action={i + 1}>
            Row action {i + 1}
          </Button>
        </div>
      ))}
    </div>
  )

  return (
    <FloatingActionsProvider>
      <AssistantProvider>
        <FloatingCameraProvider>
          <LayoutModeProvider preference={layout}>
            <div data-staff-shell className="flex min-h-svh bg-background">
              <main className="w-full min-w-0 flex-1 px-(--page-gutter-x) pt-(--page-gutter-top) pb-[calc(9rem+env(safe-area-inset-bottom))] tablet:pb-[calc(13rem+env(safe-area-inset-bottom))]">
                {camera && <CameraTarget />}
                {assignable ? (
                  <AssignSubcontractors projectId={project.id} projectName={project.name} rows={rowsFor(projectKey)}>
                    {content}
                  </AssignSubcontractors>
                ) : (
                  content
                )}
              </main>
            </div>
            <TabletBottomNav
              items={[
                { href: '/dashboard', label: 'Home', icon: 'house' },
                { href: '/schedule', label: 'Schedule', icon: 'calendar' },
                { href: '/documents', label: 'Documents', icon: 'file' },
              ]}
              homeHref="/dashboard"
              closedGroups={[]}
            />
            <FloatingActionStack>{assistant && <AssistantLauncher configured={false} />}</FloatingActionStack>
          </LayoutModeProvider>
          <Dialog open={dialog} onOpenChange={setDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Blocking dialog</DialogTitle>
                <DialogDescription>Fixture dialog used to check the floating action steps aside.</DialogDescription>
              </DialogHeader>
            </DialogContent>
          </Dialog>
          <Sheet open={drawer} onOpenChange={setDrawer}>
            <SheetContent side="right">
              <SheetHeader>
                <SheetTitle>Drawer</SheetTitle>
                <SheetDescription>Fixture drawer used to check the floating action steps aside.</SheetDescription>
              </SheetHeader>
            </SheetContent>
          </Sheet>
          <FormOverlay open={form} onClose={() => setForm(false)} variant="drawer" title="Form drawer">
            <p className="p-5 text-sm">Fixture form drawer.</p>
          </FormOverlay>
        </FloatingCameraProvider>
      </AssistantProvider>
    </FloatingActionsProvider>
  )
}
