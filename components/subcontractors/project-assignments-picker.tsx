'use client'

import { useMemo, useState } from 'react'
import { Combobox } from '@base-ui/react/combobox'
import { AlertCircle, Check, ChevronDown, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { PROJECT_STATUS_LABELS, type ProjectStatus } from '@/lib/domain'
import { MAX_PROJECT_ASSIGNMENTS, type AssignableProject } from '@/lib/subcontractor-projects'
import { cn } from '@/lib/utils'

export type ProjectPickerAvailability = 'ready' | 'setup-required' | 'error'

const projectLabel = (p: AssignableProject) => `${p.project_number} · ${p.name}`
const statusLabel = (status: string) => PROJECT_STATUS_LABELS[status as ProjectStatus] ?? status

export function ProjectAssignmentsPicker({
  projects: allProjects,
  availability,
  defaultValue = '',
  error,
  lockedProjects = [],
}: {
  projects: AssignableProject[]
  availability: ProjectPickerAvailability
  defaultValue?: string
  error?: string
  /** Projects already associated. They are history, so they are shown but cannot be removed or reselected. */
  lockedProjects?: AssignableProject[]
}) {
  const projects = useMemo(() => {
    const locked = new Set(lockedProjects.map((p) => p.id))
    return allProjects.filter((p) => !locked.has(p.id))
  }, [allProjects, lockedProjects])
  const initial = useMemo(() => {
    const wanted = new Set(defaultValue.split(',').filter(Boolean))
    return projects.filter((p) => wanted.has(p.id))
  }, [defaultValue, projects])
  const [selected, setSelected] = useState<AssignableProject[]>(initial)
  const editing = lockedProjects.length > 0

  const lockedList = editing ? (
    <div className="flex flex-col gap-2 sm:col-span-2">
      <p className="text-xs font-medium text-muted-foreground">
        {`Already on ${lockedProjects.length} ${lockedProjects.length === 1 ? 'project' : 'projects'} · kept as project history`}
      </p>
      <ul className="flex flex-wrap gap-2">
        {lockedProjects.map((p) => (
          <li key={p.id} className="flex min-w-0 max-w-full items-center gap-2 rounded-md border border-border bg-muted/50 px-2.5 py-1 text-sm">
            <span className="truncate">
              <span className="text-muted-foreground">{p.project_number}</span> {p.name}
            </span>
            <Badge variant="outline" className="shrink-0">
              {statusLabel(p.status)}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  ) : null

  if (availability !== 'ready') {
    return (
      <p role="status" className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground sm:col-span-2">
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {availability === 'setup-required'
          ? 'Project assignments need a database update before they can be used. An administrator must apply the subcontractor project assignments migration. You can still save the company now and assign projects afterward.'
          : 'Projects could not be loaded. You can still save the company and assign projects later.'}
      </p>
    )
  }

  if (!projects.length) {
    return (
      <>
        {lockedList}
        <p className="rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground sm:col-span-2">
          {editing
            ? 'No other projects are in preconstruction, construction, or closeout right now.'
            : 'No projects are in preconstruction, construction, or closeout right now. You can assign projects later.'}
        </p>
      </>
    )
  }

  const describedBy = error ? 'project_ids-error' : 'project_ids-hint'
  const remove = (id: string) => setSelected((prev) => prev.filter((p) => p.id !== id))

  return (
    <div className="flex min-w-0 flex-col gap-3 sm:col-span-2">
      {lockedList}
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor="project_ids" className="text-sm font-medium text-foreground">
          {editing ? 'Add projects' : 'Projects'} <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>

        {selected.map((p) => (
          <input key={p.id} type="hidden" name="project_ids" value={p.id} />
        ))}

        <Combobox.Root
          items={projects}
          multiple
          value={selected}
          onValueChange={(value) => setSelected((value as AssignableProject[]).slice(0, MAX_PROJECT_ASSIGNMENTS))}
          itemToStringLabel={projectLabel}
          isItemEqualToValue={(a, b) => a.id === b.id}
        >
          <div className="relative">
            <Combobox.Input
              id="project_ids"
              placeholder="Search by project name or number"
              aria-invalid={error ? true : undefined}
              aria-describedby={describedBy}
              className={cn(
                'h-10 w-full min-w-0 rounded-lg border border-input bg-background pl-2.5 pr-9 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/80',
                'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
                'aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20',
              )}
            />
            <div className="absolute inset-y-0 right-1 flex items-center">
              <Combobox.Trigger
                aria-label="Show projects"
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
              >
                <ChevronDown className="size-4" aria-hidden="true" />
              </Combobox.Trigger>
            </div>
          </div>

          <Combobox.Portal>
            <Combobox.Positioner sideOffset={4} collisionPadding={8} className="z-50 outline-none">
              <Combobox.Popup className="w-(--anchor-width) max-h-[min(var(--available-height),22rem)] overflow-y-auto overscroll-contain rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg outline-none data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 transition-opacity">
                <Combobox.Empty className="px-3 py-6 text-center text-sm text-muted-foreground empty:hidden">
                  No matching projects.
                </Combobox.Empty>
                <Combobox.List className="outline-none">
                  {(p: AssignableProject) => (
                    <Combobox.Item
                      key={p.id}
                      value={p}
                      className="flex min-h-11 cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
                    >
                      <span className="flex size-4 shrink-0 items-center justify-center">
                        <Combobox.ItemIndicator>
                          <Check className="size-4" aria-hidden="true" />
                        </Combobox.ItemIndicator>
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-medium">{p.name}</span>
                        <span className="text-xs text-muted-foreground">{p.project_number}</span>
                      </span>
                      <Badge variant="outline" className="shrink-0">
                        {statusLabel(p.status)}
                      </Badge>
                    </Combobox.Item>
                  )}
                </Combobox.List>
              </Combobox.Popup>
            </Combobox.Positioner>
          </Combobox.Portal>
        </Combobox.Root>

        {error ? (
          <p id="project_ids-error" className="flex items-start gap-1.5 text-xs leading-relaxed text-destructive">
            <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            {error}
          </p>
        ) : (
          <p id="project_ids-hint" className="text-xs leading-relaxed text-muted-foreground">
            Only projects in preconstruction, construction, or closeout are listed. Choose as many as needed.
          </p>
        )}
      </div>

      <div aria-live="polite" className="flex flex-col gap-2">
        <p className="text-xs font-medium text-muted-foreground">
          {selected.length
            ? `${selected.length} ${editing ? 'new ' : ''}${selected.length === 1 ? 'project' : 'projects'} selected`
            : editing
              ? 'No new projects selected'
              : 'No projects selected'}
        </p>
        {selected.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {selected.map((p) => (
              <li
                key={p.id}
                className="flex min-w-0 max-w-full items-center gap-1.5 rounded-md border border-border bg-muted/50 py-1 pl-2.5 pr-1 text-sm"
              >
                <span className="truncate">
                  <span className="text-muted-foreground">{p.project_number}</span> {p.name}
                </span>
                <button
                  type="button"
                  onClick={() => remove(p.id)}
                  aria-label={`Remove ${p.name}`}
                  className="flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring sm:size-6"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
