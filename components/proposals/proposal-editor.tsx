'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { FileDown, Loader2, Lock, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ProposalDocument, type ProposalHeader } from '@/components/proposals/proposal-document'
import { saveEstimateProposal } from '@/app/actions/proposals'
import {
  PRICING_DISPLAYS,
  PRICING_DISPLAY_DESCRIPTIONS,
  PRICING_DISPLAY_LABELS,
  PROPOSAL_TEXT_FIELDS,
  PROPOSAL_TEXT_LABELS,
  PROPOSAL_TEXT_LIMITS,
  type ClientPricing,
  type PricingDisplay,
  type ProposalContent,
  type ProposalTemplate,
  type ProposalTextField,
} from '@/lib/proposals'

type Draft = {
  template_id: string | null
  title: string
  pricing_display: PricingDisplay
  show_scope: boolean
} & Record<ProposalTextField, string>

const selectClass =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60'

function toDraft(p: ProposalContent): Draft {
  return {
    template_id: p.template_id,
    title: p.title,
    pricing_display: p.pricing_display,
    show_scope: p.show_scope,
    introduction: p.introduction ?? '',
    exclusions: p.exclusions ?? '',
    payment_terms: p.payment_terms ?? '',
    terms: p.terms ?? '',
    acceptance_text: p.acceptance_text ?? '',
  }
}

const TEXT_ROWS: Record<ProposalTextField, number> = { introduction: 4, exclusions: 5, payment_terms: 4, terms: 8, acceptance_text: 3 }

export function ProposalEditor({
  estimateId,
  initial,
  pricing,
  header,
  scope,
  templates,
  editable,
  lockedReason,
  pdfHref,
  canManageTemplates,
}: {
  estimateId: string
  initial: ProposalContent
  pricing: ClientPricing
  header: Omit<ProposalHeader, 'title'>
  scope: string | null
  templates: ProposalTemplate[]
  editable: boolean
  lockedReason: string | null
  pdfHref: string
  canManageTemplates: boolean
}) {
  const [saved, setSaved] = useState(() => toDraft(initial))
  const [draft, setDraft] = useState(saved)
  const [pending, startTransition] = useTransition()
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved])

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }))

  const applyTemplate = (id: string) => {
    const template = templates.find((t) => t.id === id)
    if (!template) return set('template_id', null)
    setDraft((d) => ({
      ...d,
      template_id: template.id,
      pricing_display: template.pricing_display,
      introduction: template.introduction ?? '',
      exclusions: template.exclusions ?? '',
      payment_terms: template.payment_terms ?? '',
      terms: template.terms ?? '',
      acceptance_text: template.acceptance_text ?? '',
    }))
    toast.message(`Applied "${template.name}". Review the text, then save.`)
  }

  const save = () =>
    startTransition(async () => {
      const result = await saveEstimateProposal(estimateId, draft)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setSaved(draft)
      toast.success('Proposal saved.')
    })

  const content = {
    introduction: draft.introduction || null,
    exclusions: draft.exclusions || null,
    payment_terms: draft.payment_terms || null,
    terms: draft.terms || null,
    acceptance_text: draft.acceptance_text || null,
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(20rem,26rem)_1fr]">
      <form
        className="surface flex flex-col gap-5 p-5 lg:sticky lg:top-[calc(var(--app-header-h,4rem)+1rem)] lg:max-h-[calc(100dvh-var(--app-header-h,4rem)-2rem)] lg:overflow-y-auto"
        onSubmit={(e) => {
          e.preventDefault()
          if (editable && dirty && !pending) save()
        }}
        aria-label="Proposal settings"
      >
        {!editable && lockedReason && (
          <p className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{lockedReason}</span>
          </p>
        )}
        {!initial.saved && editable && (
          <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
            This proposal uses your default template. Save to keep a copy with this estimate revision.
          </p>
        )}

        <fieldset disabled={!editable || pending} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="proposal-template">Template</Label>
            <select
              id="proposal-template"
              className={selectClass}
              value={draft.template_id ?? ''}
              onChange={(e) => applyTemplate(e.target.value)}
            >
              <option value="">No template</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.is_default ? ' (default)' : ''}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Choosing a template replaces the text below.
              {canManageTemplates && (
                <>
                  {' '}
                  <Link href="/settings/proposal-templates" className="font-medium text-primary hover:underline">
                    Manage templates
                  </Link>
                </>
              )}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="proposal-title">Title</Label>
            <Input id="proposal-title" value={draft.title} maxLength={200} onChange={(e) => set('title', e.target.value)} />
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">Pricing shown to the homeowner</legend>
            {PRICING_DISPLAYS.map((mode) => (
              <label
                key={mode}
                className="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm has-checked:border-primary has-checked:bg-primary/5"
              >
                <input
                  type="radio"
                  name="pricing_display"
                  value={mode}
                  checked={draft.pricing_display === mode}
                  onChange={() => set('pricing_display', mode)}
                  className="mt-0.5 accent-primary"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium">{PRICING_DISPLAY_LABELS[mode]}</span>
                  <span className="text-xs text-muted-foreground">{PRICING_DISPLAY_DESCRIPTIONS[mode]}</span>
                </span>
              </label>
            ))}
            <p className="text-xs text-muted-foreground">
              Builder costs, markup, and contingency are never shown. Prices include them.
            </p>
          </fieldset>

          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={draft.show_scope}
              onChange={(e) => set('show_scope', e.target.checked)}
              className="mt-0.5 accent-primary"
            />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">Include scope of work</span>
              <span className="text-xs text-muted-foreground">Uses the estimate description.</span>
            </span>
          </label>

          {PROPOSAL_TEXT_FIELDS.map((field) => (
            <div key={field} className="flex flex-col gap-2">
              <Label htmlFor={`proposal-${field}`}>{PROPOSAL_TEXT_LABELS[field]}</Label>
              <Textarea
                id={`proposal-${field}`}
                rows={TEXT_ROWS[field]}
                maxLength={PROPOSAL_TEXT_LIMITS[field]}
                value={draft[field]}
                onChange={(e) => set(field, e.target.value)}
              />
            </div>
          ))}
        </fieldset>

        <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-wrap items-center gap-2 border-t bg-card p-4">
          {editable && (
            <Button type="submit" disabled={!dirty || pending}>
              {pending ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Save data-icon="inline-start" />}
              {dirty ? 'Save proposal' : 'Saved'}
            </Button>
          )}
          {dirty ? (
            <Button type="button" variant="outline" disabled title="Save your changes to download the PDF">
              <FileDown data-icon="inline-start" />
              Download PDF
            </Button>
          ) : (
            <Button variant="outline" render={<a href={pdfHref} />} nativeButton={false}>
              <FileDown data-icon="inline-start" />
              Download PDF
            </Button>
          )}
          {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
        </div>
      </form>

      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">Homeowner preview. This is exactly what the PDF and client portal show.</p>
        <div className="overflow-hidden rounded-lg border shadow-sm">
          <ProposalDocument
            header={{ ...header, title: draft.title || 'Proposal' }}
            content={content}
            pricingDisplay={draft.pricing_display}
            scope={draft.show_scope ? scope : null}
            pricing={pricing}
          />
        </div>
      </div>
    </div>
  )
}
