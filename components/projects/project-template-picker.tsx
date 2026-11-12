'use client'

import { cn } from '@/lib/utils'
import type { ProjectTemplateOption, StandardScheduleSummary } from '@/components/projects/project-form'

type Choice = {
  value: string
  label: string
  meta: string
}

function count(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`
}

export function templateMeta(t: Pick<ProjectTemplateOption, 'phases' | 'activities' | 'milestones' | 'estimatedBusinessDays'>) {
  const parts = [
    count(t.phases, 'phase', 'phases'),
    count(t.activities, 'activity', 'activities'),
    count(t.milestones, 'milestone', 'milestones'),
  ]
  if (t.estimatedBusinessDays !== null) parts.push(count(t.estimatedBusinessDays, 'business day', 'business days'))
  return parts.join(' · ')
}

function standardMeta(s: StandardScheduleSummary | null) {
  if (!s) return 'Standard construction activities, grouped by phase'
  return templateMeta({ ...s, estimatedBusinessDays: null })
}

function ChoiceCard({ choice, checked, onSelect }: { choice: Choice; checked: boolean; onSelect: (v: string) => void }) {
  return (
    <label
      className={cn(
        'flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border bg-background px-3 py-2.5 transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50',
        checked ? 'border-primary bg-sage/60' : 'border-input hover:border-primary/40',
      )}
    >
      <input
        type="radio"
        name="schedule_setup"
        value={choice.value}
        checked={checked}
        onChange={() => onSelect(choice.value)}
        className="mt-0.5 size-4 shrink-0 accent-primary"
      />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium leading-snug text-foreground">{choice.label}</span>
        <span className="text-xs text-muted-foreground">{choice.meta}</span>
      </span>
    </label>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="grid gap-2 sm:grid-cols-2">{children}</div>
    </div>
  )
}

export function ProjectTemplatePicker({
  value,
  onChange,
  templates,
  standardSchedule,
}: {
  value: string
  onChange: (value: string) => void
  templates: ProjectTemplateOption[]
  standardSchedule: StandardScheduleSummary | null
}) {
  const toChoice = (t: ProjectTemplateOption): Choice => ({ value: `tpl:${t.versionId}`, label: t.name, meta: templateMeta(t) })
  const starter: Choice[] = [
    { value: 'standard', label: 'Standard Construction Schedule', meta: standardMeta(standardSchedule) },
    ...templates.filter((t) => t.isStarter).map(toChoice),
  ]
  const company = templates.filter((t) => !t.isStarter).map(toChoice)

  return (
    <fieldset className="flex min-w-0 flex-col gap-4 sm:col-span-2">
      <legend className="sr-only">Project template</legend>
      <Group title="Starter templates">
        {starter.map((c) => (
          <ChoiceCard key={c.value} choice={c} checked={value === c.value} onSelect={onChange} />
        ))}
      </Group>
      {company.length > 0 && (
        <Group title="My company templates">
          {company.map((c) => (
            <ChoiceCard key={c.value} choice={c} checked={value === c.value} onSelect={onChange} />
          ))}
        </Group>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <ChoiceCard
          choice={{ value: 'later', label: 'Configure later', meta: 'Blank project, no schedule activities' }}
          checked={value === 'later'}
          onSelect={onChange}
        />
      </div>
    </fieldset>
  )
}
