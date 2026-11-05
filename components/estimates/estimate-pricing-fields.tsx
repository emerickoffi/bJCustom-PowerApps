'use client'

import { useState } from 'react'
import { AlertTriangle as AlertTriangleIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TextAreaField, TextField } from '@/components/shared/form-field'

/** True when a dollar string holds a non-zero amount (unparseable text counts, so its error stays visible). */
export function hasAmount(raw: string | null | undefined) {
  const cleaned = (raw ?? '').replace(/[$,\s]/g, '')
  return cleaned !== '' && Number(cleaned) !== 0
}

export function formatDollars(raw: string) {
  const n = Number(raw.replace(/[$,\s]/g, ''))
  return Number.isFinite(n) ? n.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : raw
}

type Errors = Record<string, string | undefined>

/**
 * Markup, contingency and the optional land cost. Render inside a two-column grid. State initializes from
 * props, so remount (via a parent `key`) to pick up new values. Land stays separate from construction totals.
 */
export function EstimatePricingFields({
  markup,
  contingency,
  land,
  savedLandCost,
  errors,
}: {
  markup: string
  contingency: string
  land: string
  /** The land amount already stored on the estimate; removing it needs confirmation. */
  savedLandCost: string | null
  errors: Errors
}) {
  const [landValue, setLandValue] = useState(land)
  const [includeLand, setIncludeLand] = useState(hasAmount(land) || Boolean(errors.land_cost))
  const [confirmRemoval, setConfirmRemoval] = useState(false)
  const savedLand = hasAmount(savedLandCost) ? savedLandCost : null

  const toggleLand = (next: boolean) => {
    if (!next && savedLand) {
      setConfirmRemoval(true)
      return
    }
    setConfirmRemoval(false)
    setIncludeLand(next)
  }

  return (
    <>
      <TextField
        name="markup_percent"
        label="Markup (%)"
        inputMode="decimal"
        defaultValue={markup}
        error={errors.markup_percent}
        hint="Applied to direct costs."
      />
      <TextField
        name="contingency_percent"
        label="Contingency (%)"
        inputMode="decimal"
        defaultValue={contingency}
        error={errors.contingency_percent}
        hint="Applied to direct costs, allowances and markup."
      />

      <div className="flex flex-col gap-3 sm:col-span-2">
        <label className="flex min-h-11 cursor-pointer items-start gap-3 sm:min-h-0">
          <input
            type="checkbox"
            checked={includeLand}
            onChange={(e) => toggleLand(e.target.checked)}
            aria-controls="land-cost-group"
            className="mt-0.5 size-4 shrink-0 accent-primary"
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">Include land purchase cost</span>
            <span className="text-xs text-muted-foreground">Shown separately. Never added to the construction total.</span>
          </span>
        </label>

        {confirmRemoval && savedLand && (
          <div
            role="alert"
            className="flex flex-col gap-3 rounded-lg border border-amber-300/70 bg-amber-50 px-3.5 py-3 text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100"
          >
            <p className="flex items-start gap-2 text-sm">
              <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                <strong className="font-medium">{`Remove the saved land cost of ${formatDollars(savedLand)}?`}</strong> It will be
                cleared from this estimate when you save. Construction totals are not affected.
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" className="bg-background" onClick={() => setConfirmRemoval(false)}>
                Keep land cost
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={() => {
                  setConfirmRemoval(false)
                  setIncludeLand(false)
                }}
              >
                Remove land cost
              </Button>
            </div>
          </div>
        )}

        <div id="land-cost-group">
          {includeLand ? (
            <TextField
              name="land_cost"
              label="Land cost (USD)"
              inputMode="decimal"
              value={landValue}
              onChange={(e) => setLandValue(e.target.value)}
              error={errors.land_cost}
              placeholder="e.g. 85000"
              className="sm:max-w-[calc(50%-0.625rem)]"
            />
          ) : (
            <input type="hidden" name="land_cost" value="" />
          )}
        </div>
      </div>
    </>
  )
}

/** Description and notes shown on the estimate page and PDF. Render inside a two-column grid. */
export function EstimateDetailFields({
  description,
  notes,
  errors,
}: {
  description: string
  notes: string
  errors: Errors
}) {
  return (
    <>
      <TextAreaField
        name="description"
        label="Description"
        defaultValue={description}
        error={errors.description}
        hint="Scope summary shown with the estimate details and on the PDF."
        inputClassName="min-h-20"
        className="sm:col-span-2"
      />
      <TextAreaField
        name="notes"
        label="Notes"
        defaultValue={notes}
        error={errors.notes}
        hint="Terms or remarks shown in a Notes box on the estimate and the PDF."
        inputClassName="min-h-20"
        className="sm:col-span-2"
      />
    </>
  )
}
