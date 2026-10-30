'use client'

import { useMemo, useRef, useState } from 'react'
import { Combobox } from '@base-ui/react/combobox'
import { AlertCircle, FolderKanban, Plus, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MAX_FORM_PROJECT_ASSIGNMENTS, PROJECT_ROLE_OPTIONS, type PendingProjectAssignment } from '@/lib/contacts'
import { comboboxInputClass, comboboxItemClass, comboboxListClass, comboboxPopupClass } from '@/components/contacts/company-combobox'

export type AssignableProjectOption = { id: string; name: string; project_number: string | null }
export type CurrentProjectAssignment = { project_id: string; name: string; project_number: string | null; project_role: string }

function projectLabel(p: { name: string; project_number: string | null }) {
  return p.project_number ? `${p.project_number} · ${p.name}` : p.name
}

/**
 * Lets the user stage project assignments while creating or editing a contact. Nothing is written until the contact
 * form is saved; the staged list is submitted as JSON in `project_assignments`.
 */
export function ProjectAssignmentsField({
  projects,
  current = [],
  value,
  onChange,
  error,
}: {
  projects: AssignableProjectOption[]
  current?: CurrentProjectAssignment[]
  value: PendingProjectAssignment[]
  onChange: (value: PendingProjectAssignment[]) => void
  error?: string
}) {
  const [picking, setPicking] = useState(false)
  const roleRefs = useRef(new Map<string, HTMLInputElement>())
  const byId = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  const taken = new Set([...current.map((c) => c.project_id), ...value.map((v) => v.project_id)])
  const available = projects.filter((p) => !taken.has(p.id))
  const atLimit = value.length >= MAX_FORM_PROJECT_ASSIGNMENTS

  function add(project: AssignableProjectOption) {
    onChange([...value, { project_id: project.id, project_role: '' }])
    setPicking(false)
    requestAnimationFrame(() => roleRefs.current.get(project.id)?.focus())
  }

  return (
    <div className="flex flex-col gap-4 sm:col-span-2">
      <input type="hidden" name="project_assignments" value={value.length ? JSON.stringify(value) : ''} />

      {current.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Current projects</p>
          <ul className="flex flex-col divide-y divide-border/60 rounded-lg border border-border/80">
            {current.map((c) => (
              <li key={c.project_id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <FolderKanban className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{projectLabel(c)}</span>
                <span className="shrink-0 text-muted-foreground">{c.project_role}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {value.length > 0 && (
        <ul className="flex flex-col gap-3" aria-label="Projects to assign">
          {value.map((row, index) => {
            const project = byId.get(row.project_id)
            const label = project ? projectLabel(project) : 'Unavailable project'
            const roleId = `project-role-${row.project_id}`
            return (
              <li key={row.project_id} className="flex flex-col gap-3 rounded-lg border border-border/80 bg-muted/30 p-3 sm:flex-row sm:items-end">
                <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:pb-2.5">
                  <FolderKanban className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  <span className="truncate text-sm font-medium text-foreground">{label}</span>
                </div>
                <div className="flex flex-col gap-1.5 sm:w-64">
                  <Label htmlFor={roleId} className="text-xs">
                    Role on project<span className="text-destructive" aria-hidden="true">*</span>
                    <span className="sr-only">(required)</span>
                  </Label>
                  <Input
                    id={roleId}
                    ref={(el) => {
                      if (el) roleRefs.current.set(row.project_id, el)
                      else roleRefs.current.delete(row.project_id)
                    }}
                    value={row.project_role}
                    onChange={(e) => onChange(value.map((v, i) => (i === index ? { ...v, project_role: e.target.value } : v)))}
                    list="project-role-options"
                    maxLength={120}
                    placeholder="e.g. Project Supervisor"
                    aria-invalid={error && !row.project_role.trim() ? true : undefined}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onChange(value.filter((_, i) => i !== index))}
                  aria-label={`Remove ${label}`}
                  className="self-end"
                >
                  <X />
                </Button>
              </li>
            )
          })}
        </ul>
      )}
      <datalist id="project-role-options">
        {PROJECT_ROLE_OPTIONS.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>

      {picking ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <ProjectPicker projects={available} onPick={add} />
          <Button type="button" variant="ghost" onClick={() => setPicking(false)}>
            Cancel
          </Button>
        </div>
      ) : projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">There are no active projects to assign yet.</p>
      ) : available.length === 0 ? (
        <p className="text-sm text-muted-foreground">Every active project is already selected.</p>
      ) : (
        <div>
          <Button type="button" variant="outline" onClick={() => setPicking(true)} disabled={atLimit}>
            <Plus data-icon="inline-start" />
            Assign to project
          </Button>
        </div>
      )}

      {error && (
        <p id="project_assignments-error" className="flex items-start gap-1.5 text-xs leading-relaxed text-destructive" role="alert">
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  )
}

function ProjectPicker({ projects, onPick }: { projects: AssignableProjectOption[]; onPick: (p: AssignableProjectOption) => void }) {
  return (
    <Combobox.Root
      items={projects}
      value={null as AssignableProjectOption | null}
      onValueChange={(p) => p && onPick(p as AssignableProjectOption)}
      itemToStringLabel={(p) => projectLabel(p as AssignableProjectOption)}
      itemToStringValue={(p) => (p as AssignableProjectOption).id}
      defaultOpen
      autoHighlight
    >
      <Combobox.InputGroup className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Combobox.Input aria-label="Search projects" placeholder="Search projects by name or number…" className={comboboxInputClass} autoFocus />
      </Combobox.InputGroup>
      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4} className="z-50 outline-none">
          <Combobox.Popup className={comboboxPopupClass}>
            <Combobox.Empty>
              <p className="px-3 py-2.5 text-sm text-muted-foreground">No matching projects.</p>
            </Combobox.Empty>
            <Combobox.List className={comboboxListClass}>
              {(p: AssignableProjectOption) => (
                <Combobox.Item key={p.id} value={p} className={comboboxItemClass}>
                  <FolderKanban className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  {p.project_number && <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{p.project_number}</span>}
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  )
}
