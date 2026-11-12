'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, LayoutTemplate, Plus, Rocket, Save, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { PageHeader } from '@/components/shared/page-header'
import { publishTemplateAction, saveTemplateDraftAction, setTemplateArchivedAction } from '@/app/actions/project-templates'
import {
  TEMPLATE_ACTIVITY_TYPES,
  allKeys,
  describeDuration,
  moveItem,
  newTemplateKey,
  pruneForwardDependencies,
  publishBlockers,
  removeActivity,
  removePhase,
  summarizeTemplate,
  validateTemplateContent,
  type TemplateActivity,
  type TemplateActivityType,
  type TemplateContent,
} from '@/lib/project-templates'
import { formatDate } from '@/lib/format'

const TYPE_LABELS: Record<TemplateActivityType, string> = {
  task: 'Task',
  milestone: 'Milestone',
  inspection: 'Inspection',
  meeting: 'Meeting',
}

const fieldClass =
  'h-9 w-full rounded-md border border-input bg-white px-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

type EditorTemplate = {
  id: string
  name: string
  description: string
  projectType: string
  status: 'draft' | 'published'
  archived: boolean
  updatedAt: string
  content: TemplateContent
}

type Version = { id: string; version: number; createdAt: string; current: boolean }

function ActivityRow({
  activity,
  index,
  count,
  earlier,
  nameOf,
  onChange,
  onMove,
  onRemove,
}: {
  activity: TemplateActivity
  index: number
  count: number
  earlier: TemplateActivity[]
  nameOf: Map<string, string>
  onChange: (next: TemplateActivity) => void
  onMove: (to: number) => void
  onRemove: () => void
}) {
  const id = `act-${activity.key}`
  const available = earlier.filter((a) => !activity.predecessors.includes(a.key))
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border bg-white p-3">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_9rem_7rem_6rem_auto] md:items-end">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-name`} className="text-xs">
            Activity name
          </Label>
          <Input
            id={`${id}-name`}
            value={activity.name}
            maxLength={200}
            aria-invalid={!activity.name.trim()}
            onChange={(e) => onChange({ ...activity, name: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-type`} className="text-xs">
            Type
          </Label>
          <select
            id={`${id}-type`}
            className={fieldClass}
            value={activity.type}
            onChange={(e) => {
              const type = e.target.value as TemplateActivityType
              onChange({ ...activity, type, duration_days: type === 'milestone' ? 0 : activity.duration_days || 1 })
            }}
          >
            {TEMPLATE_ACTIVITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-duration`} className="text-xs">
            Business days
          </Label>
          <Input
            id={`${id}-duration`}
            type="number"
            inputMode="numeric"
            min={0}
            max={365}
            value={activity.duration_days ?? ''}
            placeholder="Not set"
            onChange={(e) => {
              const raw = e.target.value
              const n = Number.parseInt(raw, 10)
              onChange({ ...activity, duration_days: raw === '' || Number.isNaN(n) ? null : n })
            }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-weight`} className="text-xs">
            Weight
          </Label>
          <Input
            id={`${id}-weight`}
            type="number"
            inputMode="decimal"
            min={0}
            max={1000}
            value={activity.weight}
            onChange={(e) => {
              const n = Number(e.target.value)
              onChange({ ...activity, weight: Number.isFinite(n) ? n : 0 })
            }}
          />
        </div>
        <div className="flex gap-1">
          <Button type="button" variant="ghost" size="icon" disabled={index === 0} onClick={() => onMove(index - 1)} aria-label={`Move ${activity.name || 'activity'} up`}>
            <ArrowUp />
          </Button>
          <Button type="button" variant="ghost" size="icon" disabled={index === count - 1} onClick={() => onMove(index + 1)} aria-label={`Move ${activity.name || 'activity'} down`}>
            <ArrowDown />
          </Button>
          <Button type="button" variant="ghost" size="icon" onClick={onRemove} aria-label={`Remove ${activity.name || 'activity'}`}>
            <Trash2 />
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Starts after:</span>
        {activity.predecessors.length === 0 && <span className="text-xs text-muted-foreground">Project start</span>}
        {activity.predecessors.map((k) => (
          <span key={k} className="inline-flex items-center gap-1 rounded-full bg-interactive-soft py-0.5 pl-2.5 pr-1 text-xs text-brand-deep">
            {nameOf.get(k) || 'Unnamed activity'}
            <button
              type="button"
              className="flex size-5 items-center justify-center rounded-full hover:bg-white"
              aria-label={`Remove dependency on ${nameOf.get(k) || 'unnamed activity'}`}
              onClick={() => onChange({ ...activity, predecessors: activity.predecessors.filter((p) => p !== k) })}
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          </span>
        ))}
        {available.length > 0 && activity.predecessors.length < 10 && (
          <select
            aria-label={`Add a dependency for ${activity.name || 'this activity'}`}
            className="h-7 rounded-md border border-dashed border-input bg-white px-2 text-xs text-muted-foreground"
            value=""
            onChange={(e) => e.target.value && onChange({ ...activity, predecessors: [...activity.predecessors, e.target.value] })}
          >
            <option value="">+ Add dependency</option>
            {available.map((a) => (
              <option key={a.key} value={a.key}>
                {a.name || 'Unnamed activity'}
              </option>
            ))}
          </select>
        )}
      </div>
    </li>
  )
}

export function TemplateEditor({
  template,
  versions,
  projectsUsing,
}: {
  template: EditorTemplate
  versions: Version[]
  projectsUsing: number
}) {
  const router = useRouter()
  const [name, setName] = useState(template.name)
  const [description, setDescription] = useState(template.description)
  const [content, setContent] = useState<TemplateContent>(template.content)
  const [updatedAt, setUpdatedAt] = useState(template.updatedAt)
  const [dirty, setDirty] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [pending, start] = useTransition()

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const summary = useMemo(() => summarizeTemplate(content), [content])
  const nameOf = useMemo(() => new Map(content.phases.flatMap((p) => p.activities.map((a) => [a.key, a.name] as const))), [content])
  const liveErrors = useMemo(() => {
    const r = validateTemplateContent(content)
    return r.ok ? [] : r.errors
  }, [content])

  const update = (next: TemplateContent, note?: string) => {
    setContent(next)
    setDirty(true)
    setErrors([])
    setMessage(note ?? null)
  }
  const reorder = (next: TemplateContent) => {
    const { content: pruned, removed } = pruneForwardDependencies(next)
    update(pruned, removed ? `${removed} ${removed === 1 ? 'dependency was' : 'dependencies were'} removed because ${removed === 1 ? 'it' : 'they'} would now point to later work.` : undefined)
  }
  const setPhase = (i: number, patch: Partial<TemplateContent['phases'][number]>) =>
    update({ phases: content.phases.map((p, j) => (j === i ? { ...p, ...patch } : p)) })

  const save = () =>
    new Promise<boolean>((resolve) =>
      start(async () => {
        const res = await saveTemplateDraftAction(template.id, {
          name,
          description,
          project_type: template.projectType,
          content,
          expectedUpdatedAt: updatedAt,
        })
        if (res.ok) {
          if (res.updatedAt) setUpdatedAt(res.updatedAt)
          setDirty(false)
          setErrors([])
          toast.success('Draft saved')
          resolve(true)
        } else {
          setErrors(res.errors ?? [res.error])
          toast.error(res.error)
          resolve(false)
        }
      }),
    )

  const publish = async () => {
    const blockers = publishBlockers(content)
    if (blockers.length) {
      setErrors(blockers)
      return
    }
    if (dirty && !(await save())) return
    start(async () => {
      const res = await publishTemplateAction(template.id)
      if (res.ok) {
        toast.success('Template published. New projects can use it now.')
        router.refresh()
      } else {
        setErrors(res.errors ?? [res.error])
        toast.error(res.error)
      }
    })
  }

  const toggleArchive = () =>
    start(async () => {
      const res = await setTemplateArchivedAction(template.id, !template.archived)
      if (res.ok) {
        toast.success(template.archived ? 'Template restored' : 'Template archived')
        router.refresh()
      } else toast.error(res.error)
    })

  const shownErrors = errors.length ? errors : liveErrors
  const current = versions.find((v) => v.current)

  return (
    <>
      <PageHeader
        icon={LayoutTemplate}
        title={name.trim() || 'Untitled template'}
        backHref="/settings/templates"
        backLabel="Project templates"
        titleAddon={
          template.archived ? (
            <Badge variant="outline">Archived</Badge>
          ) : template.status === 'published' ? (
            <Badge>{`Published · v${current?.version ?? 1}`}</Badge>
          ) : (
            <Badge variant="outline">Draft</Badge>
          )
        }
        actions={
          <>
            <Button variant="outline" onClick={toggleArchive} disabled={pending}>
              {template.archived ? 'Restore' : 'Archive'}
            </Button>
            <Button variant="outline" onClick={() => void save()} disabled={pending || !dirty}>
              <Save data-icon="inline-start" />
              {dirty ? 'Save draft' : 'Saved'}
            </Button>
            {!template.archived && (
              <Button onClick={() => void publish()} disabled={pending}>
                <Rocket data-icon="inline-start" />
                {template.status === 'published' ? 'Publish new version' : 'Publish'}
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-5">
          <section aria-labelledby="tpl-details" className="surface flex flex-col gap-4 p-4">
            <h2 id="tpl-details" className="type-section-title text-foreground">
              Details
            </h2>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tpl-name">Name</Label>
              <Input id="tpl-name" value={name} maxLength={120} onChange={(e) => { setName(e.target.value); setDirty(true) }} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tpl-description">Description</Label>
              <Textarea id="tpl-description" value={description} maxLength={1000} rows={2} onChange={(e) => { setDescription(e.target.value); setDirty(true) }} />
            </div>
          </section>

          {(shownErrors.length > 0 || message) && (
            <div role={shownErrors.length ? 'alert' : 'status'} className="flex flex-col gap-1 rounded-xl border border-border bg-white p-4 text-sm">
              {message && <p className="text-muted-foreground">{message}</p>}
              {shownErrors.length > 0 && (
                <>
                  <p className="font-medium text-destructive">Fix these before saving or publishing:</p>
                  <ul className="list-disc pl-5 text-destructive">
                    {shownErrors.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

          <section aria-labelledby="tpl-phases" className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <h2 id="tpl-phases" className="type-section-title text-foreground">
                Phases and activities
              </h2>
              <Button
                variant="outline"
                size="sm"
                disabled={content.phases.length >= 40}
                onClick={() => update({ phases: [...content.phases, { name: `Phase ${content.phases.length + 1}`, activities: [] }] })}
              >
                <Plus data-icon="inline-start" />
                Add phase
              </Button>
            </div>
            {content.phases.length === 0 && (
              <p className="rounded-xl border border-dashed border-border bg-white p-5 text-sm text-muted-foreground">
                No phases yet. Add a phase such as Preconstruction or Foundation, then add its activities.
              </p>
            )}
            <ol className="flex flex-col gap-4">
              {content.phases.map((phase, pi) => {
                const earlierAll = content.phases.slice(0, pi).flatMap((p) => p.activities)
                return (
                  <li key={pi} className="flex flex-col gap-3 rounded-xl border border-border bg-[#F8F7F3] p-3 sm:p-4">
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="flex min-w-48 flex-1 flex-col gap-1">
                        <Label htmlFor={`phase-${pi}`} className="text-xs">
                          {`Phase ${pi + 1}`}
                        </Label>
                        <Input id={`phase-${pi}`} value={phase.name} maxLength={120} className="bg-white font-medium" aria-invalid={!phase.name.trim()} onChange={(e) => setPhase(pi, { name: e.target.value })} />
                      </div>
                      <Button type="button" variant="ghost" size="icon" disabled={pi === 0} onClick={() => reorder({ phases: moveItem(content.phases, pi, pi - 1) })} aria-label={`Move phase ${phase.name} up`}>
                        <ArrowUp />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" disabled={pi === content.phases.length - 1} onClick={() => reorder({ phases: moveItem(content.phases, pi, pi + 1) })} aria-label={`Move phase ${phase.name} down`}>
                        <ArrowDown />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove phase ${phase.name}`}
                        onClick={() => {
                          if (phase.activities.length && !window.confirm(`Remove “${phase.name}” and its ${phase.activities.length} activities?`)) return
                          update(removePhase(content, pi))
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                    {phase.activities.length > 0 && (
                      <ol className="flex flex-col gap-2">
                        {phase.activities.map((act, ai) => (
                          <ActivityRow
                            key={act.key}
                            activity={act}
                            index={ai}
                            count={phase.activities.length}
                            earlier={[...earlierAll, ...phase.activities.slice(0, ai)]}
                            nameOf={nameOf}
                            onChange={(next) => setPhase(pi, { activities: phase.activities.map((a, j) => (j === ai ? next : a)) })}
                            onMove={(to) =>
                              reorder({
                                phases: content.phases.map((p, j) => (j === pi ? { ...p, activities: moveItem(p.activities, ai, to) } : p)),
                              })
                            }
                            onRemove={() => update(removeActivity(content, act.key))}
                          />
                        ))}
                      </ol>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="self-start"
                      disabled={phase.activities.length >= 80}
                      onClick={() => {
                        const prev = phase.activities.at(-1) ?? earlierAll.at(-1)
                        const activity: TemplateActivity = {
                          key: newTemplateKey(allKeys(content)),
                          name: '',
                          type: 'task',
                          duration_days: 1,
                          weight: 1,
                          predecessors: prev ? [prev.key] : [],
                        }
                        setPhase(pi, { activities: [...phase.activities, activity] })
                      }}
                    >
                      <Plus data-icon="inline-start" />
                      Add activity
                    </Button>
                  </li>
                )
              })}
            </ol>
          </section>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-4">
          <section aria-labelledby="tpl-summary" className="surface flex flex-col gap-3 p-4">
            <h2 id="tpl-summary" className="type-section-title text-foreground">
              Summary
            </h2>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              {[
                ['Phases', summary.phases],
                ['Activities', summary.activities],
                ['Milestones', summary.milestones],
                ['Inspections', summary.inspections],
                ['Dependencies', summary.dependencies],
                ['Undated', summary.undated],
              ].map(([label, value]) => (
                <div key={label} className="flex flex-col rounded-lg bg-[#F8F9FA] px-3 py-2">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="font-semibold tabular-nums text-foreground">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="text-sm text-foreground">
              <span className="text-muted-foreground">Estimated length: </span>
              {describeDuration(summary.estimatedBusinessDays)}
            </p>
            <p className="text-xs text-muted-foreground">
              Dates are calculated from the project&apos;s start date when the template is applied, counting weekdays only.
            </p>
          </section>
          <section aria-labelledby="tpl-versions" className="surface flex flex-col gap-2 p-4">
            <h2 id="tpl-versions" className="type-section-title text-foreground">
              Published versions
            </h2>
            {versions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Not published yet. Only published versions can be used for new projects.</p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {versions.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-2">
                    <span className="font-medium text-foreground">{`Version ${v.version}`}</span>
                    <span className="text-xs text-muted-foreground">{v.current ? 'Current' : formatDate(v.createdAt.slice(0, 10))}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">
              {projectsUsing === 0
                ? 'No projects use this template yet.'
                : `${projectsUsing} ${projectsUsing === 1 ? 'project was' : 'projects were'} created from it. They keep the version they started with.`}
            </p>
          </section>
        </aside>
      </div>
    </>
  )
}
