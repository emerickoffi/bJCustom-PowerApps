'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { setLaborRateAction } from '@/app/actions/time'

export function RateRow({ userId, name, role, cents }: { userId: string; name: string; role: string; cents: number | null }) {
  const initial = cents === null ? '' : (cents / 100).toFixed(2)
  const [value, setValue] = useState(initial)
  const [saved, setSaved] = useState(initial)
  const [pending, start] = useTransition()
  const id = `rate-${userId}`
  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between md:px-5">
      <div className="flex flex-col">
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {name}
        </label>
        <span className="text-xs text-muted-foreground">{role}</span>
      </div>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          start(async () => {
            const r = await setLaborRateAction({ userId, hourly: value })
            if (r.ok) {
              setSaved(value)
              toast.success(r.message ?? 'Saved.')
            } else toast.error(r.error)
          })
        }}
      >
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
          <Input
            id={id}
            inputMode="decimal"
            placeholder="0.00"
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, '').slice(0, 7))}
            className="h-10 w-28 pl-6 text-right tabular-nums"
          />
        </div>
        <span className="text-sm text-muted-foreground">/ hr</span>
        <Button type="submit" variant="outline" disabled={pending || value === saved || !value}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </form>
    </li>
  )
}
