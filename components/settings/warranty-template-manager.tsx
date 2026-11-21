'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, Copy, Pencil, Plus, ShieldCheck, Star, Trash2, X } from 'lucide-react'
import {
  deleteWarrantyTemplateAction,
  saveWarrantyTemplateAction,
  setDefaultWarrantyTemplateAction,
  type WarrantyActionResult,
} from '@/app/actions/warranty-templates'
import type { WarrantyTemplateRecord } from '@/lib/warranty-templates-data'
import {
  WARRANTY_LIMITS,
  durationParts,
  formatDuration,
  parseCategories,
  parseReminderDays,
  toMonths,
  type WarrantyTemplateInput,
} from '@/lib/warranty-templates'
import { Surface } from '@/components/shared/page-header'
import { SemanticBadge } from '@/components/shared/semantic-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type CoverageDraft = {
  uid: string
  key: string | null
  name: string
  amount: string
  unit: 'months' | 'years'
  categories: string
  description: string
  exclusions: string
}

type Draft = {
  id: string | null
  name: string
  description: string
  disclaimer: string
  reminders: string
  coverages: CoverageDraft[]
}

const DEFAULT_DISCLAIMER =
  "Coverage categories are administrative guides. Actual warranty eligibility is governed by the builder's written warranty agreement."

let uidCounter = 0
const uid = () => `c${++uidCounter}`

const blankCoverage = (): CoverageDraft => ({
  uid: uid(),
  key: null,
  name: '',
  amount: '1',
  unit: 'years',
  categories: '',
  description: '',
  exclusions: '',
})

function toDraft(t: WarrantyTemplateRecord | null, copy = false): Draft {
  if (!t) {
    return { id: null, name: '', description: '', disclaimer: DEFAULT_DISCLAIMER, reminders: '30, 7, 0', coverages: [blankCoverage()] }
  }
  return {
    id: copy ? null : t.id,
    name: copy ? `${t.name} (copy)`.slice(0, WARRANTY_LIMITS.nameMax) : t.name,
    description: t.description ?? '',
    disclaimer: t.disclaimer,
    reminders: t.reminder_days.join(', '),
    coverages: t.coverages.map((c) => {
      const d = durationParts(c.duration_months)
      return {
        uid: uid(),
        key: c.coverage_key,
        name: c.name,
        amount: String(d.value),
        unit: d.unit,
        categories: c.categories.join('\n'),
        description: c.description ?? '',
        exclusions: c.exclusions ?? '',
      }
    }),
  }
}

function toInput(d: Draft): WarrantyTemplateInput | string {
  const reminderDays = parseReminderDays(d.reminders)
  if (!reminderDays) return 'Reminder days must be whole numbers, like 30, 7, 0.'
  const coverages = []
  for (const c of d.coverages) {
    const amount = Number(c.amount)
    if (!Number.isFinite(amount) || amount <= 0) return `${c.name || 'A coverage'}: enter how long it lasts.`
    coverages.push({
      key: c.key,
      name: c.name,
      durationMonths: toMonths(amount, c.unit),
      categories: parseCategories(c.categories),
      description: c.description,
      exclusions: c.exclusions,
    })
  }
  return { name: d.name, description: d.description, disclaimer: d.disclaimer, reminderDays, coverages }
}

export function WarrantyTemplateManager({ templates, editable }: { templates: WarrantyTemplateRecord[]; editable: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)

  const run = (task: () => Promise<WarrantyActionResult>, after?: () => void) =>
    startTransition(async () => {
      const r = await task()
      if (!r.ok) return setMessage({ tone: 'error', text: r.error })
      setMessage({ tone: 'success', text: r.message })
      after?.()
      router.refresh()
    })

  const open = (d: Draft) => {
    setMessage(null)
    setConfirmDelete(null)
    setDraft(d)
  }

  const save = () => {
    if (!draft) return
    const input = toInput(draft)
    if (typeof input === 'string') return setMessage({ tone: 'error', text: input })
    run(() => saveWarrantyTemplateAction(draft.id, input), () => setDraft(null))
  }

  const banner = message && (
    <p
      role={message.tone === 'error' ? 'alert' : 'status'}
      className={
        message.tone === 'error'
          ? 'rounded-xl bg-destructive/8 px-4 py-3 text-sm text-destructive'
          : 'rounded-xl bg-sage px-4 py-3 text-sm text-foreground'
      }
    >
      {message.text}
    </p>
  )

  if (draft) {
    return (
      <div className="flex flex-col gap-4">
        {banner}
        <Editor draft={draft} onChange={setDraft} pending={pending} onCancel={() => setDraft(null)} onSave={save} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {!editable && (
        <p className="rounded-xl bg-champagne-soft px-4 py-3 text-sm text-foreground">
          Editing warranties becomes available once the latest database update is applied.
        </p>
      )}
      {banner}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Homes get the default warranty when they&apos;re completed unless the project picks another one. Changes apply to future
          homes only: homes already under warranty keep the terms they started with.
        </p>
        <Button type="button" onClick={() => open(toDraft(null))} disabled={!editable || pending}>
          <Plus className="size-4" aria-hidden="true" />
          New warranty
        </Button>
      </div>

      {templates.map((t) => (
        <Surface key={t.id} className="gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#E6F5F6] text-[#006773]" aria-hidden="true">
                <ShieldCheck className="size-[18px]" />
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold text-foreground">
                  {t.name}
                  {t.is_default && <SemanticBadge tone="active">Default</SemanticBadge>}
                </h3>
                {t.description && <p className="text-sm text-muted-foreground">{t.description}</p>}
                <p className="text-xs text-muted-foreground">
                  {t.activeHomes} {t.activeHomes === 1 ? 'home' : 'homes'} under this warranty
                  {t.plannedProjects > 0 && ` · ${t.plannedProjects} ${t.plannedProjects === 1 ? 'project' : 'projects'} set to use it`}
                  {' · Reminders '}
                  {t.reminder_days.map((d) => (d === 0 ? 'on the day' : `${d}d`)).join(', ')} before each coverage ends
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => open(toDraft(t))} disabled={!editable || pending}>
                <Pencil className="size-3.5" aria-hidden="true" />
                Edit
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => open(toDraft(t, true))} disabled={!editable || pending}>
                <Copy className="size-3.5" aria-hidden="true" />
                Duplicate
              </Button>
              {!t.is_default && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => run(() => setDefaultWarrantyTemplateAction(t.id))}
                  disabled={!editable || pending}
                >
                  <Star className="size-3.5" aria-hidden="true" />
                  Make default
                </Button>
              )}
              {!t.is_default &&
                (confirmDelete === t.id ? (
                  <span className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => run(() => deleteWarrantyTemplateAction(t.id), () => setConfirmDelete(null))}
                      disabled={pending}
                    >
                      Delete
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(null)} disabled={pending}>
                      Keep
                    </Button>
                  </span>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDelete(t.id)}
                    disabled={!editable || pending}
                    aria-label={`Delete ${t.name}`}
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  </Button>
                ))}
            </div>
          </div>
          {confirmDelete === t.id && (
            <p className="text-xs text-muted-foreground">
              Delete this warranty? Projects set to use it will get the default instead. Homes already under it keep their terms.
            </p>
          )}

          <ul className="divide-y rounded-lg border">
            {t.coverages.map((c) => (
              <li key={c.coverage_key} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
                <span className="w-28 shrink-0 text-sm font-semibold tabular-nums text-[#006773]">{formatDuration(c.duration_months)}</span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-medium text-foreground">{c.name}</span>
                  <span className="text-xs leading-relaxed text-muted-foreground">{c.categories.join(', ')}</span>
                  {c.exclusions && <span className="text-xs leading-relaxed text-muted-foreground">Not covered: {c.exclusions}</span>}
                </span>
              </li>
            ))}
          </ul>
        </Surface>
      ))}
    </div>
  )
}

function Editor({
  draft,
  onChange,
  pending,
  onCancel,
  onSave,
}: {
  draft: Draft
  onChange: (d: Draft) => void
  pending: boolean
  onCancel: () => void
  onSave: () => void
}) {
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch })
  const setCoverage = (i: number, patch: Partial<CoverageDraft>) =>
    set({ coverages: draft.coverages.map((c, j) => (j === i ? { ...c, ...patch } : c)) })
  const move = (i: number, dir: -1 | 1) => {
    const next = [...draft.coverages]
    const j = i + dir
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    set({ coverages: next })
  }

  return (
    <Surface>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-foreground">{draft.id ? 'Edit warranty' : 'New warranty'}</h3>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          <X className="size-4" aria-hidden="true" />
          Cancel
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="w-name">Warranty name</Label>
          <Input
            id="w-name"
            value={draft.name}
            maxLength={WARRANTY_LIMITS.nameMax}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="Smith Homes Limited Warranty"
            disabled={pending}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="w-reminders">Reminder days before a coverage ends</Label>
          <Input
            id="w-reminders"
            value={draft.reminders}
            onChange={(e) => set({ reminders: e.target.value })}
            placeholder="30, 7, 0"
            inputMode="numeric"
            disabled={pending}
            aria-describedby="w-reminders-hint"
          />
          <p id="w-reminders-hint" className="text-xs text-muted-foreground">
            Up to {WARRANTY_LIMITS.remindersMax}, separated by commas. 0 means on the last day.
          </p>
        </div>
        <div className="flex flex-col gap-1.5 md:col-span-2">
          <Label htmlFor="w-desc">Summary (optional)</Label>
          <Input
            id="w-desc"
            value={draft.description}
            maxLength={WARRANTY_LIMITS.descriptionMax}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="Coverage periods run at the same time, starting on the official completion date."
            disabled={pending}
          />
        </div>
        <div className="flex flex-col gap-1.5 md:col-span-2">
          <Label htmlFor="w-disclaimer">Note shown to homeowners</Label>
          <Textarea
            id="w-disclaimer"
            value={draft.disclaimer}
            maxLength={WARRANTY_LIMITS.disclaimerMax}
            onChange={(e) => set({ disclaimer: e.target.value })}
            rows={3}
            disabled={pending}
          />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h4 className="text-sm font-semibold text-foreground">Coverages</h4>
        {draft.coverages.map((c, i) => (
          <fieldset key={c.uid} className="flex flex-col gap-3 rounded-lg border p-4" disabled={pending}>
            <legend className="sr-only">Coverage {i + 1}</legend>
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${c.uid}-name`}>Coverage name</Label>
                <Input
                  id={`${c.uid}-name`}
                  value={c.name}
                  maxLength={WARRANTY_LIMITS.coverageNameMax}
                  onChange={(e) => setCoverage(i, { name: e.target.value })}
                  placeholder="Workmanship"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${c.uid}-amount`}>Length</Label>
                <div className="flex gap-2">
                  <Input
                    id={`${c.uid}-amount`}
                    className="w-20"
                    value={c.amount}
                    inputMode="numeric"
                    onChange={(e) => setCoverage(i, { amount: e.target.value.replace(/[^\d]/g, '') })}
                  />
                  <select
                    aria-label="Unit"
                    value={c.unit}
                    onChange={(e) => setCoverage(i, { unit: e.target.value as 'months' | 'years' })}
                    className="h-9 rounded-control border border-input bg-background px-2 text-sm"
                  >
                    <option value="years">years</option>
                    <option value="months">months</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${c.uid}-cats`}>What it covers</Label>
              <Textarea
                id={`${c.uid}-cats`}
                value={c.categories}
                onChange={(e) => setCoverage(i, { categories: e.target.value })}
                rows={3}
                placeholder={'Paint\nTrim and doors\nCabinets'}
                aria-describedby={`${c.uid}-cats-hint`}
              />
              <p id={`${c.uid}-cats-hint`} className="text-xs text-muted-foreground">
                One per line. Homeowners choose from these when they report a problem.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${c.uid}-desc`}>Description (optional)</Label>
                <Textarea id={`${c.uid}-desc`} value={c.description} onChange={(e) => setCoverage(i, { description: e.target.value })} rows={2} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${c.uid}-excl`}>Not covered (optional)</Label>
                <Textarea
                  id={`${c.uid}-excl`}
                  value={c.exclusions}
                  onChange={(e) => setCoverage(i, { exclusions: e.target.value })}
                  rows={2}
                  placeholder="Normal wear, homeowner damage…"
                />
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-1">
              <Button type="button" variant="ghost" size="sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${c.name || 'coverage'} up`}>
                <ArrowUp className="size-3.5" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => move(i, 1)}
                disabled={i === draft.coverages.length - 1}
                aria-label={`Move ${c.name || 'coverage'} down`}
              >
                <ArrowDown className="size-3.5" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => set({ coverages: draft.coverages.filter((_, j) => j !== i) })}
                disabled={draft.coverages.length === 1}
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
                Remove
              </Button>
            </div>
          </fieldset>
        ))}
        {draft.coverages.length < WARRANTY_LIMITS.coveragesMax && (
          <Button
            type="button"
            variant="outline"
            className="self-start"
            onClick={() => set({ coverages: [...draft.coverages, blankCoverage()] })}
            disabled={pending}
          >
            <Plus className="size-4" aria-hidden="true" />
            Add coverage
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <Button type="button" onClick={onSave} disabled={pending}>
          {pending ? 'Saving…' : draft.id ? 'Save warranty' : 'Create warranty'}
        </Button>
        <p className="text-xs text-muted-foreground">Homes already under warranty keep their current terms.</p>
      </div>
    </Surface>
  )
}
