'use client'

import { useMemo, useState } from 'react'
import { Combobox } from '@base-ui/react/combobox'
import { AlertCircle, Check, ChevronDown, FolderKanban, History, Plus, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { PROJECT_STATUS_LABELS, type ProjectStatus } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import {
  MAX_PROJECT_ASSIGNMENTS,
  PROJECT_ASSIGNMENT_MIGRATIONS,
  type AssignableProject,
  type ProjectAssignmentRecord,
} from '@/lib/subcontractor-projects'
import { EndAssignmentDialog } from '@/components/subcontractors/end-assignment-dialog'
import { cn } from '@/lib/utils'

export type ProjectPickerAvailability = 'ready' | 'setup-required' | 'error'

const projectLabel = (p: AssignableProject) => `${p.project_number} · ${p.name}`
const statusLabel = (status: string) => PROJECT_STATUS_LABELS[status as ProjectStatus] ?? status

/** Present only on the edit form. */
export type ExistingAssignments = {
  companyId: string
  current: ProjectAssignmentRecord[]
  history: ProjectAssignmentRecord[]
  /** Active scheduled activity names per project id, or null when they could not be loaded. */
  activeWork: Record<string, string[]> | null
}

export function ProjectAssignmentsPicker({
  projects: allProjects,
  availability,
  defaultValue = '',
  error,
  existing,
}: {
  projects: AssignableProject[]
  availability: ProjectPickerAvailability
  defaultValue?: string
  error?: string
  existing?: ExistingAssignments
}) {
  const projects = useMemo(() => {
    const current = new Set(existing?.current.map((r) => r.project.id))
    return allProjects.filter((p) => !current.has(p.id))
  }, [allProjects, existing])

  if (availability === 'setup-required') {
    return (
      <div role="status" className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground sm:col-span-2">
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div className="flex min-w-0 flex-col gap-1.5">
          <p>
            Project assignments are not set up in the database yet, so they cannot be shown or saved. You can still save
            the company details now and assign projects afterward.
          </p>
          <p>An administrator must apply these Supabase migrations, in order:</p>
          <ol className="ml-4 list-decimal break-all font-mono text-xs text-foreground">
            {PROJECT_ASSIGNMENT_MIGRATIONS.map((m) => (
              <li key={m}>{`supabase/migrations/${m}`}</li>
            ))}
          </ol>
        </div>
      </div>
    )
  }
  if (availability === 'error') {
    return (
      <p role="status" className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground sm:col-span-2">
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        Projects could not be loaded. You can still save the company and assign projects later.
      </p>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-6 sm:col-span-2">
      {existing && <CurrentProjects existing={existing} />}
      <AddProjects projects={projects} defaultValue={defaultValue} error={error} editing={Boolean(existing)} />
      {existing && <ProjectHistory history={existing.history} />}
    </div>
  )
}

function GroupHeading({ icon: Icon, title, count }: { icon: typeof FolderKanban; title: string; count?: number }) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
      <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
      {title}
      {count !== undefined && (
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">{count}</span>
      )}
    </h3>
  )
}

function ProjectName({ project }: { project: AssignableProject }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate text-sm font-medium text-foreground">{project.name}</span>
      <span className="text-xs text-muted-foreground">{project.project_number}</span>
    </span>
  )
}

function CurrentProjects({ existing }: { existing: ExistingAssignments }) {
  const [ending, setEnding] = useState<ProjectAssignmentRecord | null>(null)
  const { current, activeWork, companyId } = existing

  return (
    <section aria-labelledby="current-projects-heading" className="flex flex-col gap-2.5">
      <div id="current-projects-heading">
        <GroupHeading icon={FolderKanban} title="Current Projects" count={current.length} />
      </div>
      {current.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-3 text-sm text-muted-foreground">
          Not assigned to any current project. Add one below.
        </p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {current.map((r) => {
            const work = activeWork?.[r.project.id]?.length ?? 0
            return (
              <li key={r.assignment_id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
                <div className="min-w-0 flex-1 basis-48">
                  <ProjectName project={r.project} />
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{statusLabel(r.project.status)}</Badge>
                  <span className="hidden text-xs text-muted-foreground md:inline">{`Since ${formatDate(r.associated_at)}`}</span>
                  {work > 0 && (
                    <span className="text-xs text-muted-foreground">{`${work} scheduled`}</span>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-auto text-muted-foreground hover:text-destructive"
                  onClick={() => setEnding(r)}
                  aria-label={`End assignment to ${r.project.name}`}
                >
                  <X data-icon="inline-start" />
                  End
                </Button>
              </li>
            )
          })}
        </ul>
      )}
      {ending && (
        <EndAssignmentDialog
          key={ending.assignment_id}
          companyId={companyId}
          assignmentId={ending.assignment_id}
          projectLabel={projectLabel(ending.project)}
          activeWork={activeWork ? (activeWork[ending.project.id] ?? []) : null}
          open
          onOpenChange={(open) => !open && setEnding(null)}
        />
      )}
    </section>
  )
}

function ProjectHistory({ history }: { history: ProjectAssignmentRecord[] }) {
  return (
    <section aria-labelledby="project-history-heading" className="flex flex-col gap-2.5">
      <div id="project-history-heading">
        <GroupHeading icon={History} title="Project History" count={history.length} />
      </div>
      {history.length === 0 ? (
        <p className="text-sm text-muted-foreground">No previous assignments yet. Ended assignments and completed projects appear here.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border bg-muted/30">
          {history.map((r) => (
            <li key={r.assignment_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
              <div className="min-w-0 flex-1 basis-48">
                <ProjectName project={r.project} />
              </div>
              <Badge variant="outline">{statusLabel(r.project.status)}</Badge>
              <span className="w-full text-xs text-muted-foreground sm:w-auto">
                {r.ended_at
                  ? `${formatDate(r.associated_at)} – ${formatDate(r.ended_at)}`
                  : `Since ${formatDate(r.associated_at)} · project closed`}
                {r.end_reason ? ` · ${r.end_reason}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function AddProjects({
  projects,
  defaultValue,
  error,
  editing,
}: {
  projects: AssignableProject[]
  defaultValue: string
  error?: string
  editing: boolean
}) {
  const initial = useMemo(() => {
    const wanted = new Set(defaultValue.split(',').filter(Boolean))
    return projects.filter((p) => wanted.has(p.id))
  }, [defaultValue, projects])
  const [selected, setSelected] = useState<AssignableProject[]>(initial)
  const describedBy = error ? 'project_ids-error' : 'project_ids-hint'
  const remove = (id: string) => setSelected((prev) => prev.filter((p) => p.id !== id))

  if (!projects.length) {
    return (
      <p className="rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">
        {editing
          ? 'No other projects are in preconstruction, construction, or closeout right now.'
          : 'No projects are in preconstruction, construction, or closeout right now. You can assign projects later.'}
      </p>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor="project_ids" className="flex items-center gap-2 text-sm font-medium text-foreground">
        {editing && <Plus className="size-4 text-muted-foreground" aria-hidden="true" />}
        {editing ? 'Add Project' : 'Projects'} <span className="font-normal text-muted-foreground">(optional)</span>
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
          {editing
            ? 'Only projects in preconstruction, construction, or closeout are listed. New projects are added when you save changes.'
            : 'Only projects in preconstruction, construction, or closeout are listed. Choose as many as needed.'}
        </p>
      )}

      <div aria-live="polite" className="mt-1 flex flex-col gap-2">
        {selected.length > 0 && (
          <>
            <p className="text-xs font-medium text-muted-foreground">
              {`${selected.length} ${editing ? 'new ' : ''}${selected.length === 1 ? 'project' : 'projects'} selected`}
            </p>
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
                    aria-label={`Remove ${p.name} from selection`}
                    className="flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring sm:size-6"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
