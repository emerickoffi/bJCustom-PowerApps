'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { setCompanyPlanAction } from '@/app/actions/platform'
import type { PlatformPlan } from '@/lib/platform-shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/shared/form-field'

function planLine(p: PlatformPlan) {
  const seats = p.max_staff === null ? 'unlimited team' : `${p.max_staff} team seats`
  return `${p.name}${p.is_public ? '' : ' (not offered to customers)'} · ${seats}`
}

/** Moves one company to another plan. Saved with an optional note and logged as an owner action. */
export function CompanyPlanPicker({
  organizationId,
  currentPlan,
  plans,
}: {
  organizationId: string
  currentPlan: string
  plans: PlatformPlan[]
}) {
  const [plan, setPlan] = useState(currentPlan)
  const [note, setNote] = useState('')
  const [pending, startTransition] = useTransition()
  const selected = plans.find((p) => p.key === plan)
  const changed = plan !== currentPlan

  function save() {
    startTransition(async () => {
      const result = await setCompanyPlanAction(organizationId, plan, note)
      if (result.error) toast.error(result.error)
      else {
        toast.success(result.success)
        setNote('')
      }
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="company-plan" className="text-sm font-medium">
          Plan
        </label>
        <NativeSelect id="company-plan" value={plan} onChange={(e) => setPlan(e.target.value)} disabled={pending}>
          {plans.map((p) => (
            <option key={p.key} value={p.key}>
              {planLine(p)}
            </option>
          ))}
        </NativeSelect>
        {selected?.tagline && <p className="text-xs text-muted-foreground">{selected.tagline}</p>}
      </div>
      {changed && (
        <>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="company-plan-note" className="text-sm font-medium">
              Note <span className="font-normal text-muted-foreground">(optional, owners only)</span>
            </label>
            <Input
              id="company-plan-note"
              value={note}
              maxLength={500}
              placeholder="e.g. Upgraded after sales call"
              onChange={(e) => setNote(e.target.value)}
              disabled={pending}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Modules outside the new plan switch off for this company right away. Their records are kept and come back if the plan
            includes them again.
          </p>
          <div className="flex gap-2">
            <Button onClick={save} disabled={pending}>
              {pending ? 'Saving…' : `Move to ${selected?.name ?? 'plan'}`}
            </Button>
            <Button variant="outline" onClick={() => setPlan(currentPlan)} disabled={pending}>
              Cancel
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
