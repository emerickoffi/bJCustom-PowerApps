'use client'

import {
  captureBaselineAction,
  excludeOptionalActivityAction,
  includeOptionalActivityAction,
  initializeScheduleAction,
} from '@/app/actions/schedule'
import { ListPlus } from 'lucide-react'
import { OPTIONAL_ACTIVITIES } from '@/lib/schedule'
import { SectionDisclosure } from '@/components/schedule/schedule-section-card'
import { SECTION_CARD_CLASS, SectionCardHeader } from '@/components/schedule/schedule-section-header'
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
  const includedNames = OPTIONAL_ACTIVITIES.filter((o) => includedKeys.includes(o.key)).map((o) => o.name)
  return (
    <section aria-labelledby="optional-activities-heading" className={SECTION_CARD_CLASS}>
      <SectionCardHeader
        icon={ListPlus}
        title="Optional activities"
        titleId="optional-activities-heading"
        description="Include only when this project needs them"
      />
      <SectionDisclosure
        expandLabel="Manage"
        summary={
          <>
            <span className="font-medium tabular-nums text-brand-deep">{`${includedNames.length} of ${OPTIONAL_ACTIVITIES.length} included`}</span>
            {includedNames.length > 0 && <span className="block truncate text-xs">{includedNames.join(', ')}</span>}
          </>
        }
      >
      <ul className="flex flex-col divide-y">
        {OPTIONAL_ACTIVITIES.map((o) => {
          const included = includedKeys.includes(o.key)
          return (
            <li key={o.key} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{o.name}</span>
                  <span className="rounded-badge bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{o.phase}</span>
                  {included && (
                    <span className="rounded-badge bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">Included</span>
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
      </SectionDisclosure>
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
