'use client'

import {
  captureBaselineAction,
  excludeOptionalActivityAction,
  includeOptionalActivityAction,
  initializeScheduleAction,
} from '@/app/actions/schedule'
import { OPTIONAL_ACTIVITIES } from '@/lib/schedule'
import { ActionButton, InlineActionForm } from '@/components/shared/inline-action'
import { SubmitButton } from '@/components/shared/form-message'
import { TextAreaField, TextField } from '@/components/shared/form-field'

export function InitializeScheduleButton({ projectId, label = 'Apply standard template' }: { projectId: string; label?: string }) {
  return (
    <ActionButton
      action={initializeScheduleAction.bind(null, projectId)}
      label={label}
      pendingLabel="Building schedule..."
      variant="default"
      size="lg"
    />
  )
}

export function OptionalActivitiesPanel({ projectId, includedKeys }: { projectId: string; includedKeys: string[] }) {
  return (
    <section aria-labelledby="optional-activities-heading" className="flex flex-col gap-3 rounded-xl border bg-card p-5">
      <div className="flex flex-col gap-1">
        <h2 id="optional-activities-heading" className="text-sm font-semibold text-foreground">
          Optional activities
        </h2>
        <p className="text-xs text-muted-foreground">
          Include these only for projects that need them. Changes apply to this project only.
        </p>
      </div>
      <ul className="flex flex-col divide-y">
        {OPTIONAL_ACTIVITIES.map((o) => {
          const included = includedKeys.includes(o.key)
          return (
            <li key={o.key} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{o.name}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{o.phase}</span>
                  {included && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">Included</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{o.description}</p>
              </div>
              {included ? (
                <ActionButton
                  action={excludeOptionalActivityAction.bind(null, projectId, o.key)}
                  label="Remove"
                  pendingLabel="Removing..."
                  confirmMessage={`Remove ${o.name} from this project's schedule?`}
                  variant="outline"
                />
              ) : (
                <ActionButton
                  action={includeOptionalActivityAction.bind(null, projectId, o.key)}
                  label="Include"
                  pendingLabel="Adding..."
                  variant="outline"
                />
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export function BaselineForm({ projectId, nextVersion }: { projectId: string; nextVersion: number }) {
  return (
    <InlineActionForm action={captureBaselineAction.bind(null, projectId)} className="flex flex-col gap-3">
      <TextField name="name" label="Baseline name" required maxLength={120} defaultValue={`Baseline v${nextVersion}`} />
      <TextAreaField name="notes" label="Notes" rows={2} maxLength={2000} hint="Why this plan is being approved or revised." />
      <SubmitButton size="default" variant="outline" pendingLabel="Approving...">
        Approve baseline
      </SubmitButton>
    </InlineActionForm>
  )
}
