'use client'

import { useActionState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { updateEstimateSettingsAction } from '@/app/actions/estimates'
import { type ActionState } from '@/lib/action-state'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'
import { useSmartForm } from '@/components/shared/smart-form'
import { EstimateDetailFields, EstimatePricingFields } from '@/components/estimates/estimate-pricing-fields'

/** Markup, contingency, land cost, description and notes, edited beside the cost items. */
export function EstimateSettingsPanel({
  estimateId,
  updatedAt,
  defaults,
}: {
  estimateId: string
  /** Remounts the form with fresh server values after any save to this estimate. */
  updatedAt: string
  defaults: { markup_percent: string; contingency_percent: string; land_cost: string; description: string; notes: string }
}) {
  const router = useRouter()
  const action = useMemo(() => updateEstimateSettingsAction.bind(null, estimateId), [estimateId])
  const [state, formAction] = useActionState<ActionState, FormData>(action, {})
  const v = state.values ?? {}
  const fe = state.fieldErrors ?? {}
  const formKey = `${updatedAt}:${state.values ? JSON.stringify(state.values) : 'saved'}`
  const { dirty, formProps } = useSmartForm(state, formKey)

  useEffect(() => {
    if (!state.success) return
    toast.success(state.success)
    router.refresh()
  }, [state, router])

  return (
    <section aria-labelledby="estimate-settings-heading" className="surface flex flex-col gap-5 p-5 md:p-6">
      <header className="flex flex-col gap-1">
        <h2 id="estimate-settings-heading" className="font-serif text-xl font-semibold tracking-tight text-foreground">
          Pricing settings &amp; notes
        </h2>
        <p className="text-sm text-muted-foreground">Review these before you finalize the estimate. Land cost stays separate from construction totals.</p>
      </header>
      <form key={formKey} action={formAction} {...formProps}>
        <div className="grid gap-4 sm:grid-cols-2">
          <EstimatePricingFields
            markup={v.markup_percent ?? defaults.markup_percent}
            contingency={v.contingency_percent ?? defaults.contingency_percent}
            land={v.land_cost ?? defaults.land_cost}
            savedLandCost={defaults.land_cost}
            errors={fe}
          />
          <EstimateDetailFields description={v.description ?? defaults.description} notes={v.notes ?? defaults.notes} errors={fe} />
        </div>
        <div className="flex flex-col gap-3 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-end">
          <div className="flex-1">{state.error && <FormMessage state={state} />}</div>
          {dirty && <p className="text-xs text-muted-foreground">Unsaved changes</p>}
          <SubmitButton pendingLabel="Saving…">Save settings</SubmitButton>
        </div>
      </form>
    </section>
  )
}
