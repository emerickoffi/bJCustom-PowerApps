'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { setCompanyDiscountAction } from '@/app/actions/platform'
import type { CompanyDiscount, CouponOption } from '@/lib/billing-discounts-shared'
import { formatDate } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/shared/form-field'

const NEW = '__new__'

/** Gives one company a Stripe discount without opening the Stripe dashboard. */
export function CompanyDiscountPicker({
  organizationId,
  current,
  coupons,
}: {
  organizationId: string
  current: CompanyDiscount | null
  coupons: CouponOption[]
}) {
  const [choice, setChoice] = useState(coupons[0]?.id ?? NEW)
  const [percent, setPercent] = useState('20')
  const [months, setMonths] = useState('3')
  const [pending, startTransition] = useTransition()

  function run(input: Parameters<typeof setCompanyDiscountAction>[1]) {
    startTransition(async () => {
      const result = await setCompanyDiscountAction(organizationId, input)
      if (result.error) toast.error(result.error)
      else toast.success(result.success)
    })
  }

  function apply() {
    if (choice === NEW) run({ kind: 'new', percentOff: Number(percent), months: Number(months) })
    else run({ kind: 'existing', couponId: choice })
  }

  return (
    <div className="flex flex-col gap-3">
      {current ? (
        <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <p className="font-medium text-foreground">{current.label}</p>
          <p className="text-xs text-muted-foreground">
            {current.pending
              ? 'Saved. Applied automatically when they choose a plan.'
              : current.endsAt
                ? `On their subscription until ${formatDate(current.endsAt)}.`
                : 'On their subscription.'}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No discount.</p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="company-coupon" className="text-sm font-medium">
          {current ? 'Replace with' : 'Discount'}
        </label>
        <NativeSelect id="company-coupon" value={choice} onChange={(e) => setChoice(e.target.value)} disabled={pending}>
          {coupons.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
          <option value={NEW}>New percentage discount…</option>
        </NativeSelect>
      </div>

      {choice === NEW && (
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="coupon-percent" className="text-sm font-medium">
              Percent off
            </label>
            <Input id="coupon-percent" type="number" inputMode="numeric" min={1} max={100} value={percent} onChange={(e) => setPercent(e.target.value)} disabled={pending} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="coupon-months" className="text-sm font-medium">
              Months <span className="font-normal text-muted-foreground">(0 = forever)</span>
            </label>
            <Input id="coupon-months" type="number" inputMode="numeric" min={0} max={36} value={months} onChange={(e) => setMonths(e.target.value)} disabled={pending} />
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button onClick={apply} disabled={pending}>
          {pending ? 'Saving…' : current ? 'Replace discount' : 'Apply discount'}
        </Button>
        {current && (
          <Button variant="outline" onClick={() => run({ kind: 'remove' })} disabled={pending}>
            Remove
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Takes effect on their next invoice. Coupons you create in Stripe also show up in this list.
      </p>
    </div>
  )
}
