'use client'

import { useCallback, useEffect, useRef } from 'react'
import { EstimateDetailFields, EstimatePricingFields } from '@/components/estimates/estimate-pricing-fields'
import { SETTINGS_FIELDS, sameSettings, useEstimateDraft, type DraftSettings } from '@/components/estimates/estimate-draft-context'

function readForm(form: HTMLFormElement): DraftSettings {
  const data = new FormData(form)
  return Object.fromEntries(SETTINGS_FIELDS.map((k) => [k, String(data.get(k) ?? '')])) as DraftSettings
}

/** Markup, contingency, land cost, description and notes. Saved together with line items by Save draft. */
export function EstimateSettingsPanel({
  defaults,
}: {
  defaults: { markup_percent: string; contingency_percent: string; land_cost: string; description: string; notes: string }
}) {
  const draft = useEstimateDraft()
  const formRef = useRef<HTMLFormElement>(null)
  const version = draft?.version ?? 0
  const errors = draft?.fieldErrors ?? {}
  const setSettings = draft?.setSettings
  const setBaseline = draft?.setBaseline

  const publish = useCallback(() => {
    if (formRef.current && setSettings) setSettings(readForm(formRef.current))
  }, [setSettings])

  useEffect(() => {
    if (!formRef.current || !setSettings || !setBaseline) return
    const loaded = readForm(formRef.current)
    setBaseline(loaded)
    setSettings(loaded)
  }, [version, setSettings, setBaseline])

  // The land toggle swaps inputs in its own state update, so read after React has committed it.
  const schedulePublish = () => requestAnimationFrame(publish)
  const dirty = !sameSettings(draft?.settings ?? null, draft?.baseline ?? null)

  return (
    <section aria-labelledby="estimate-settings-heading" className="surface flex flex-col gap-5 p-5 md:p-6">
      <header className="flex flex-col gap-1">
        <h2 id="estimate-settings-heading" className="font-serif text-xl font-semibold tracking-tight text-foreground">
          Pricing &amp; notes
        </h2>
        <p className="text-sm text-muted-foreground">
          Markup and contingency change the construction total. Land cost stays separate. The description and notes appear on the customer PDF.
        </p>
      </header>
      <form
        key={version}
        ref={formRef}
        onInput={schedulePublish}
        onChange={schedulePublish}
        onSubmit={(e) => e.preventDefault()}
        noValidate
      >
        <fieldset disabled={draft?.locked} className="contents">
          <legend className="sr-only">Pricing settings and notes</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <EstimatePricingFields
              markup={defaults.markup_percent}
              contingency={defaults.contingency_percent}
              land={defaults.land_cost}
              savedLandCost={defaults.land_cost}
              errors={errors}
            />
            <EstimateDetailFields description={defaults.description} notes={defaults.notes} errors={errors} />
          </div>
        </fieldset>
        <div className="mt-4 flex justify-end border-t border-border/60 pt-4">
          <p role="status" aria-live="polite" className={dirty ? 'text-xs font-medium text-warning' : 'text-xs text-muted-foreground'}>
            {dirty ? 'Unsaved pricing and notes. Save draft saves them with your cost items.' : 'Settings and notes saved'}
          </p>
        </div>
      </form>
    </section>
  )
}
