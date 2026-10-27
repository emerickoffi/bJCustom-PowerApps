'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ArrowUpRight } from 'lucide-react'
import { setFeatureAction } from '@/app/actions/warranty'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FEATURES, featureLabel, type FeatureDefinition, type FeatureKey, type FeatureMap } from '@/lib/feature-registry'
import { cn } from '@/lib/utils'

const GROUPS = ['Project workflow', 'Homeowner experience', 'After completion', 'Finance'] as const

type Records = Partial<Record<FeatureKey, string>>

export function FeatureToggles({ features, records }: { features: FeatureMap; records: Records }) {
  return (
    <div className="flex flex-col gap-8">
      {GROUPS.map((group) => (
        <section key={group} aria-labelledby={`group-${group}`} className="flex flex-col gap-3">
          <h2 id={`group-${group}`} className="font-serif text-lg font-semibold text-foreground">
            {group}
          </h2>
          <ul className="surface divide-y">
            {FEATURES.filter((f) => f.group === group).map((f) => (
              <FeatureRow key={f.key} feature={f} features={features} recordSummary={records[f.key]} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function StatusBadge({ feature, enabled }: { feature: FeatureDefinition; enabled: boolean }) {
  const [label, tone] = feature.setupRequired
    ? ['In development', 'bg-champagne-soft text-warning']
    : !feature.available
    ? ['Coming later', 'bg-muted text-muted-foreground']
    : enabled
      ? ['On', 'bg-primary/10 text-primary']
      : ['Off', 'bg-muted text-muted-foreground']
  return <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', tone)}>{label}</span>
}

function FeatureRow({
  feature,
  features,
  recordSummary,
}: {
  feature: FeatureDefinition
  features: FeatureMap
  recordSummary?: string
}) {
  const [pending, startTransition] = useTransition()
  const [optimistic, setOptimistic] = useState<boolean | null>(null)
  const [confirming, setConfirming] = useState(false)
  const enabled = optimistic ?? features[feature.key]
  const missing = feature.requires.filter((r) => !features[r])
  const dependents = FEATURES.filter((f) => f.requires.includes(feature.key) && features[f.key])
  const blockedReason = !feature.available
    ? null
    : !enabled && missing.length
      ? `Turn on ${missing.map(featureLabel).join(', ')} first`
      : enabled && dependents.length
        ? `Turn off ${dependents.map((d) => d.label).join(', ')} first`
        : null

  const apply = (next: boolean) => {
    setConfirming(false)
    setOptimistic(next)
    startTransition(async () => {
      const result = await setFeatureAction(feature.key, next)
      setOptimistic(null)
      if (result.error) toast.error(result.error)
      else if (result.success) toast.success(result.success)
    })
  }

  const toggle = () => {
    if (enabled && recordSummary) setConfirming(true)
    else apply(!enabled)
  }

  const id = `feature-${feature.key}`
  return (
    <li className="flex items-start justify-between gap-6 p-5">
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={id} className="font-medium text-foreground">
            {feature.label}
          </label>
          <StatusBadge feature={feature} enabled={enabled} />
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
        {feature.requires.length > 0 && (
          <p className="text-xs text-muted-foreground">{`Requires ${feature.requires.map(featureLabel).join(', ')}`}</p>
        )}
        {blockedReason && <p className="text-xs font-medium text-warning">{blockedReason}</p>}
        {feature.setupRequired && feature.setupNote && (
          <p className="text-xs font-medium text-warning">{feature.setupNote}</p>
        )}
        {((feature.available && enabled) || feature.setupRequired) && feature.configHref && (
          <Link
            href={feature.configHref}
            className="flex w-fit items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
          >
            {feature.configLabel ?? 'Configure'}
            <ArrowUpRight className="size-3" aria-hidden="true" />
          </Link>
        )}
      </div>
      {feature.available && (
        <button
          id={id}
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={pending || Boolean(blockedReason)}
          onClick={toggle}
          className={cn(
            'relative mt-1 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
            enabled ? 'bg-primary' : 'bg-muted-foreground/30',
          )}
        >
          <span className="sr-only">{enabled ? `Turn off ${feature.label}` : `Turn on ${feature.label}`}</span>
          <span
            aria-hidden="true"
            className={cn(
              'inline-block size-5 rounded-full bg-background shadow transition-transform',
              enabled ? 'translate-x-5' : 'translate-x-0.5',
            )}
          />
        </button>
      )}

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{`Turn off ${feature.label}?`}</DialogTitle>
            <DialogDescription>
              {`Your company has ${recordSummary} in this module. ${feature.disableNote ?? 'They are hidden while the module is off.'} Nothing is deleted, and turning it back on restores access.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              Keep on
            </Button>
            <Button onClick={() => apply(false)}>Turn off</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  )
}
