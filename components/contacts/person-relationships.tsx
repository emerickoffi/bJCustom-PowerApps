'use client'

import { useActionState, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Building2, FolderKanban, Plus, Star } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { initialActionState, type ActionState } from '@/lib/action-state'
import { formatDate } from '@/lib/format'
import { TextField } from '@/components/shared/form-field'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'
import { ConfirmActionButton } from '@/components/shared/confirm-action-button'
import {
  addPersonCompanyAction,
  addPersonProjectAction,
  endPersonProjectAction,
  endRelationshipAction,
} from '@/app/actions/contacts'
import type { ProjectAssociation, RelationshipHistory } from '@/lib/contacts-data'

function Panel({
  icon: Icon,
  title,
  summary,
  action,
  children,
}: {
  icon: typeof Building2
  title: string
  summary: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border/80 bg-card p-5 shadow-xs sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 pb-4">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sage text-primary ring-1 ring-inset ring-primary/10">
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <div className="flex flex-col gap-0.5 pt-0.5">
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            <p className="text-sm text-muted-foreground">{summary}</p>
          </div>
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}

function dateRange(start: string, end: string | null) {
  return end ? `${formatDate(start)} – ${formatDate(end)}` : `Since ${formatDate(start)}`
}

function History<T extends { status: string }>({ items, render }: { items: T[]; render: (item: T) => React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const past = items.filter((i) => i.status === 'ended')
  if (!past.length) return null
  return (
    <div className="flex flex-col gap-2">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="w-fit text-sm font-medium text-primary underline-offset-4 hover:underline">
        {open ? 'Hide' : 'Show'} history ({past.length})
      </button>
      {open && <ul className="flex flex-col divide-y divide-border/70 rounded-lg border border-border/70 bg-muted/30 px-3">{past.map(render)}</ul>}
    </div>
  )
}

function useDialogAction(action: (prev: ActionState, fd: FormData) => Promise<ActionState>, onDone: () => void) {
  const router = useRouter()
  const [state, formAction] = useActionState(action, initialActionState)
  useEffect(() => {
    if (state.success) {
      toast.success(state.success)
      onDone()
      router.refresh()
    }
  }, [state, onDone, router])
  return [state, formAction] as const
}

export function PersonCompanies({
  personId,
  relationships,
  companies,
  canEdit,
  personInactive,
}: {
  personId: string
  relationships: RelationshipHistory[]
  companies: { id: string; company_name: string; status: string }[]
  canEdit: boolean
  personInactive: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const current = relationships.filter((r) => r.status === 'active')
  const currentIds = new Set(current.map((r) => r.company_id))
  const available = companies.filter((c) => c.status === 'active' && !currentIds.has(c.id))
  const [state, formAction] = useDialogAction((prev, fd) => addPersonCompanyAction(personId, prev, fd), () => setOpen(false))
  const fe = state.fieldErrors ?? {}
  const v = state.values ?? {}

  return (
    <Panel
      icon={Building2}
      title="Companies"
      summary={current.length ? `Works with ${current.length} ${current.length === 1 ? 'company' : 'companies'}` : 'Independent contact'}
      action={
        canEdit && (
          <Button variant="outline" onClick={() => setOpen(true)} disabled={personInactive} title={personInactive ? 'Activate this contact first' : undefined}>
            <Plus data-icon="inline-start" />
            Add company
          </Button>
        )
      }
    >
      {current.length ? (
        <ul className="flex flex-col divide-y divide-border/70">
          {current.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/contacts/companies/${r.company_id}`} className="font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline">
                    {r.company_name}
                  </Link>
                  {r.is_primary_contact && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#FFF2DA] px-2 py-0.5 text-xs font-medium text-[#96570E]">
                      <Star className="size-3 fill-current" aria-hidden="true" />
                      Primary contact
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{[r.role, dateRange(r.started_at, null)].filter(Boolean).join(' · ')}</p>
              </div>
              {canEdit && (
                <ConfirmActionButton
                  variant="ghost"
                  size="sm"
                  label="End"
                  title={`End relationship with ${r.company_name}?`}
                  description="It moves to history. Projects this person is on are not changed."
                  confirmLabel="End relationship"
                  pendingLabel="Ending…"
                  action={async () => {
                    const res = await endRelationshipAction(r.id)
                    if (!res.error) router.refresh()
                    return res
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Not currently linked to any company.</p>
      )}
      <History
        items={relationships}
        render={(r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
            <Link href={`/contacts/companies/${r.company_id}`} className="font-medium text-foreground/80 underline-offset-4 hover:underline">
              {r.company_name}
            </Link>
            <span className="text-muted-foreground">{[r.role, dateRange(r.started_at, r.ended_at)].filter(Boolean).join(' · ')}</span>
          </li>
        )}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add company</DialogTitle>
            <DialogDescription>Link this person to another company they work with.</DialogDescription>
          </DialogHeader>
          <form key={state.values ? JSON.stringify(v) : `i-${open}`} action={formAction} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-2">
              <label htmlFor="rel-company" className="text-sm font-medium">
                Company
              </label>
              <select id="rel-company" name="company_id" defaultValue={v.company_id ?? ''} aria-invalid={fe.company_id ? true : undefined} className="h-10 rounded-lg border border-input bg-background px-2.5 text-sm">
                <option value="" disabled>
                  {available.length ? 'Choose a company' : 'No other active companies'}
                </option>
                {available.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company_name}
                  </option>
                ))}
              </select>
              {fe.company_id && <p className="text-xs text-destructive">{fe.company_id}</p>}
            </div>
            <TextField name="role" label="Role at company" defaultValue={v.role ?? ''} error={fe.role} maxLength={120} />
            <label className="flex items-center gap-2.5 text-sm">
              <input type="checkbox" name="is_primary" defaultChecked={v.is_primary === 'on'} className="size-4 accent-primary" />
              Primary contact for this company
            </label>
            <FormMessage state={state} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <SubmitButton size="default" pendingLabel="Saving…">
                Add company
              </SubmitButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Panel>
  )
}

export function PersonProjects({
  personId,
  associations,
  projects,
  relationships,
  canEdit,
  personInactive,
}: {
  personId: string
  associations: ProjectAssociation[]
  projects: { id: string; name: string; project_number: string | null }[]
  relationships: RelationshipHistory[]
  canEdit: boolean
  personInactive: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const current = associations.filter((a) => a.status === 'active')
  const currentIds = new Set(current.map((a) => a.project_id))
  const available = projects.filter((p) => !currentIds.has(p.id))
  const activeRels = relationships.filter((r) => r.status === 'active')
  const relName = new Map(relationships.map((r) => [r.id, r.company_name]))
  const [state, formAction] = useDialogAction((prev, fd) => addPersonProjectAction(personId, prev, fd), () => setOpen(false))
  const fe = state.fieldErrors ?? {}
  const v = state.values ?? {}

  return (
    <Panel
      icon={FolderKanban}
      title="Projects"
      summary={current.length ? `On ${current.length} ${current.length === 1 ? 'project' : 'projects'}` : 'Not assigned to any project'}
      action={
        canEdit && (
          <Button variant="outline" onClick={() => setOpen(true)} disabled={personInactive} title={personInactive ? 'Activate this contact first' : undefined}>
            <Plus data-icon="inline-start" />
            Add to project
          </Button>
        )
      }
    >
      {current.length ? (
        <ul className="flex flex-col divide-y divide-border/70">
          {current.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <Link href={`/projects/${a.project_id}`} className="font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline">
                  {a.name}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {[a.project_role, a.person_company_id ? `via ${relName.get(a.person_company_id) ?? 'company'}` : null, a.project_number, dateRange(a.started_at, null)]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              {canEdit && (
                <ConfirmActionButton
                  variant="ghost"
                  size="sm"
                  label="End"
                  title={`Remove from ${a.name}?`}
                  description="The association ends today and stays in the project history."
                  confirmLabel="End association"
                  pendingLabel="Ending…"
                  action={async () => {
                    const res = await endPersonProjectAction(a.id)
                    if (!res.error) router.refresh()
                    return res
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Add this person to a project to track who is involved.</p>
      )}
      <History
        items={associations}
        render={(a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
            <Link href={`/projects/${a.project_id}`} className="font-medium text-foreground/80 underline-offset-4 hover:underline">
              {a.name}
            </Link>
            <span className="text-muted-foreground">{[a.project_role, dateRange(a.started_at, a.ended_at)].join(' · ')}</span>
          </li>
        )}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add to project</DialogTitle>
            <DialogDescription>Only projects that are accepting new assignments are listed.</DialogDescription>
          </DialogHeader>
          <form key={state.values ? JSON.stringify(v) : `i-${open}`} action={formAction} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-2">
              <label htmlFor="pp-project" className="text-sm font-medium">
                Project
              </label>
              <select id="pp-project" name="project_id" defaultValue={v.project_id ?? ''} aria-invalid={fe.project_id ? true : undefined} className="h-10 rounded-lg border border-input bg-background px-2.5 text-sm">
                <option value="" disabled>
                  {available.length ? 'Choose a project' : 'No available projects'}
                </option>
                {available.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.project_number ? `${p.project_number} · ${p.name}` : p.name}
                  </option>
                ))}
              </select>
              {fe.project_id && <p className="text-xs text-destructive">{fe.project_id}</p>}
            </div>
            <TextField name="project_role" label="Project role" required defaultValue={v.project_role ?? ''} error={fe.project_role} hint="For example Architect of record or Site supervisor." maxLength={120} />
            {activeRels.length > 0 && (
              <div className="flex flex-col gap-2">
                <label htmlFor="pp-via" className="text-sm font-medium">
                  On behalf of
                </label>
                <select id="pp-via" name="person_company_id" defaultValue={v.person_company_id ?? ''} className="h-10 rounded-lg border border-input bg-background px-2.5 text-sm">
                  <option value="">Independently</option>
                  {activeRels.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.company_name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <FormMessage state={state} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <SubmitButton size="default" pendingLabel="Saving…">
                Add to project
              </SubmitButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Panel>
  )
}
