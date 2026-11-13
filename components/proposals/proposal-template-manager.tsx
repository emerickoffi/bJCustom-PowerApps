'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Archive, ArchiveRestore, Loader2, Plus, Save, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { SemanticBadge } from '@/components/shared/semantic-badge'
import { saveProposalTemplate, setProposalTemplateState } from '@/app/actions/proposals'
import { cn } from '@/lib/utils'
import {
  PRICING_DISPLAYS,
  PRICING_DISPLAY_DESCRIPTIONS,
  PRICING_DISPLAY_LABELS,
  PROPOSAL_TEXT_FIELDS,
  PROPOSAL_TEXT_LABELS,
  PROPOSAL_TEXT_LIMITS,
  type PricingDisplay,
  type ProposalTemplate,
  type ProposalText,
  type ProposalTextField,
} from '@/lib/proposals'

type Draft = { name: string; pricing_display: PricingDisplay } & Record<ProposalTextField, string>

const selectClass =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'

const TEXT_ROWS: Record<ProposalTextField, number> = { introduction: 4, exclusions: 5, payment_terms: 4, terms: 8, acceptance_text: 3 }

function toDraft(t: ProposalText & { name: string; pricing_display: PricingDisplay }): Draft {
  return {
    name: t.name,
    pricing_display: t.pricing_display,
    introduction: t.introduction ?? '',
    exclusions: t.exclusions ?? '',
    payment_terms: t.payment_terms ?? '',
    terms: t.terms ?? '',
    acceptance_text: t.acceptance_text ?? '',
  }
}

export function ProposalTemplateManager({
  templates,
  starter,
}: {
  templates: ProposalTemplate[]
  starter: ProposalText & { name: string; pricing_display: PricingDisplay }
}) {
  const router = useRouter()
  const active = templates.filter((t) => !t.archived_at)
  const archived = templates.filter((t) => t.archived_at)
  const [selectedId, setSelectedId] = useState<string | null>(active[0]?.id ?? null)
  const selected = templates.find((t) => t.id === selectedId) ?? null
  const [draft, setDraft] = useState<Draft>(() => toDraft(selected ?? starter))
  const [pending, startTransition] = useTransition()

  function select(t: ProposalTemplate | null) {
    setSelectedId(t?.id ?? null)
    setDraft(toDraft(t ?? { ...starter, name: active.length ? 'New template' : starter.name }))
  }

  function save() {
    startTransition(async () => {
      const res = await saveProposalTemplate(selectedId, draft)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success('Template saved')
      if (res.id) setSelectedId(res.id)
      router.refresh()
    })
  }

  function changeState(id: string, change: 'default' | 'archive' | 'restore') {
    startTransition(async () => {
      const res = await setProposalTemplateState(id, change)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(change === 'default' ? 'Default template updated' : change === 'archive' ? 'Template archived' : 'Template restored')
      router.refresh()
    })
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }))

  return (
    <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start">
      <nav aria-label="Proposal templates" className="surface flex flex-col gap-3 p-4">
        <Button variant="outline" onClick={() => select(null)} disabled={pending}>
          <Plus data-icon="inline-start" />
          New template
        </Button>
        {active.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No templates yet. Proposals use the starter content until you save one.
          </p>
        )}
        <ul className="flex flex-col gap-1">
          {active.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => select(t)}
                aria-current={t.id === selectedId ? 'true' : undefined}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm',
                  t.id === selectedId ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:bg-accent/60',
                )}
              >
                <span className="truncate">{t.name}</span>
                {t.is_default && <SemanticBadge tone="success">Default</SemanticBadge>}
              </button>
            </li>
          ))}
        </ul>
        {archived.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">{`Archived (${archived.length})`}</summary>
            <ul className="mt-2 flex flex-col gap-1">
              {archived.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 px-3 py-1">
                  <span className="truncate text-muted-foreground">{t.name}</span>
                  <Button size="sm" variant="ghost" onClick={() => changeState(t.id, 'restore')} disabled={pending}>
                    <ArchiveRestore data-icon="inline-start" />
                    Restore
                  </Button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </nav>

      <form
        className="surface flex flex-col gap-5 p-5 md:p-6"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="type-section-title text-foreground">{selected ? 'Edit template' : 'New template'}</h2>
          {selected && !selected.archived_at && (
            <div className="flex flex-wrap gap-2">
              {!selected.is_default && (
                <Button type="button" variant="outline" size="sm" onClick={() => changeState(selected.id, 'default')} disabled={pending}>
                  <Star data-icon="inline-start" />
                  Make default
                </Button>
              )}
              <Button type="button" variant="outline" size="sm" onClick={() => changeState(selected.id, 'archive')} disabled={pending}>
                <Archive data-icon="inline-start" />
                Archive
              </Button>
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="tpl-name">Template name</Label>
            <Input id="tpl-name" value={draft.name} maxLength={120} onChange={(e) => set('name', e.target.value)} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="tpl-pricing">Default pricing display</Label>
            <select
              id="tpl-pricing"
              className={selectClass}
              value={draft.pricing_display}
              onChange={(e) => set('pricing_display', e.target.value as PricingDisplay)}
              aria-describedby="tpl-pricing-hint"
            >
              {PRICING_DISPLAYS.map((d) => (
                <option key={d} value={d}>
                  {PRICING_DISPLAY_LABELS[d]}
                </option>
              ))}
            </select>
            <p id="tpl-pricing-hint" className="text-xs text-muted-foreground">
              {PRICING_DISPLAY_DESCRIPTIONS[draft.pricing_display]}
            </p>
          </div>
        </div>

        {PROPOSAL_TEXT_FIELDS.map((field) => (
          <div key={field} className="flex flex-col gap-2">
            <Label htmlFor={`tpl-${field}`}>{PROPOSAL_TEXT_LABELS[field]}</Label>
            <Textarea
              id={`tpl-${field}`}
              rows={TEXT_ROWS[field]}
              maxLength={PROPOSAL_TEXT_LIMITS[field]}
              value={draft[field]}
              onChange={(e) => set(field, e.target.value)}
            />
          </div>
        ))}

        <p className="text-xs text-muted-foreground">
          Templates never contain prices. Saving a template does not change proposals already saved on estimates.
        </p>
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Save data-icon="inline-start" />}
            Save template
          </Button>
        </div>
      </form>
    </div>
  )
}
