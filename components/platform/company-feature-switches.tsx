'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { setCompanyFeatureAction } from '@/app/actions/platform'
import type { CompanyFeatureRow } from '@/lib/platform-shared'
import { FEATURES } from '@/lib/feature-registry'
import { cn } from '@/lib/utils'

type Row = Pick<CompanyFeatureRow, 'switchedOn' | 'effective' | 'blockedBy'> & { key: string; label: string; description: string; group: string }

/** Module switches for one company. Each change is saved immediately and logged as an owner action. */
export function CompanyFeatureSwitches({ organizationId, rows }: { organizationId: string; rows: Row[] }) {
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const groups = Array.from(new Set(rows.map((r) => r.group)))

  function toggle(row: Row) {
    if (pendingKey) return
    setPendingKey(row.key)
    startTransition(async () => {
      const result = await setCompanyFeatureAction(organizationId, row.key, !row.switchedOn)
      setPendingKey(null)
      if (result.error) toast.error(result.error)
      else if (result.success) toast.success(result.success)
    })
  }

  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <section key={group} aria-label={group} className="flex flex-col gap-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</h3>
          <ul className="flex flex-col divide-y divide-border rounded-panel border border-border">
            {rows
              .filter((r) => r.group === group)
              .map((row) => {
                const busy = pendingKey === row.key
                const labelId = `feature-${row.key}`
                const blocked = row.blockedBy.length > 0
                return (
                  <li key={row.key} className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span id={labelId} className="text-sm font-medium text-foreground">
                        {row.label}
                      </span>
                      <span className="text-xs text-muted-foreground">{row.description}</span>
                      {blocked && (
                        <span className="text-xs text-warning">
                          {`On, but inactive until ${row.blockedBy
                            .map((k) => FEATURES.find((f) => f.key === k)?.label ?? k)
                            .join(' and ')} is turned on.`}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={row.switchedOn}
                      aria-labelledby={labelId}
                      aria-busy={busy}
                      disabled={pendingKey !== null}
                      onClick={() => toggle(row)}
                      className={cn(
                        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-wait',
                        row.switchedOn ? 'bg-interactive' : 'bg-muted-foreground/30',
                        busy && 'opacity-60',
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'inline-block size-5 rounded-full bg-white shadow transition-transform',
                          row.switchedOn ? 'translate-x-5' : 'translate-x-0.5',
                        )}
                      />
                    </button>
                  </li>
                )
              })}
          </ul>
        </section>
      ))}
    </div>
  )
}
