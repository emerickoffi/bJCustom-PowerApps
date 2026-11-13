'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ArrowUpRight,
  ClipboardList,
  FileBarChart,
  Home,
  Info,
  Lock,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
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
import {
  FEATURES,
  featureLabel,
  type FeatureDefinition,
  type FeatureGroup,
  type FeatureKey,
  type FeatureMap,
} from '@/lib/feature-registry'
import { activeDependents, canToggle, featureAvailability, rowMessage, type Availability } from '@/lib/feature-dependencies'
import { cn } from '@/lib/utils'

const GROUPS: { name: FeatureGroup; icon: LucideIcon; note?: string }[] = [
  { name: 'Clients & contacts', icon: Users },
  { name: 'Project workflow', icon: ClipboardList },
  { name: 'Homeowner experience', icon: Home },
  { name: 'After completion', icon: ShieldCheck },
  { name: 'Finance', icon: Wallet },
  { name: 'AI & automation', icon: Sparkles, note: 'AI never saves or sends anything without your approval, and only sees what your role allows.' },
  { name: 'Reporting & exports', icon: FileBarChart },
]

type Records = Partial<Record<FeatureKey, string>>

export function FeatureToggles({
  features,
  records,
  pendingSetup = {},
}: {
  features: FeatureMap
  records: Records
  /** Features whose runtime credentials or migrations are missing. */
  pendingSetup?: Partial<Record<FeatureKey, boolean>>
}) {
  const defs = FEATURES.map((f) => (pendingSetup[f.key] ? { ...f, setupRequired: true } : f))
  return (
    <div className="flex flex-col gap-6">
      {GROUPS.map(({ name: group, icon: Icon, note }) => (
        <section key={group} aria-labelledby={`group-${group}`} className="flex flex-col gap-2">
          <div className="flex flex-col gap-0.5">
            <h2 id={`group-${group}`} className="flex items-center gap-2 type-section-title text-foreground">
              <Icon className="size-4 text-primary" aria-hidden="true" />
              {group}
            </h2>
            {note && <p className="text-xs text-muted-foreground">{note}</p>}
          </div>
          <ul className="surface divide-y">
            {defs.filter((f) => f.group === group).map((f) => (
              <FeatureRow key={f.key} feature={f} defs={defs} features={features} records={records} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

const BADGES: Partial<Record<Availability, [string, string]>> = {
  core: ['Core', 'bg-secondary text-primary'],
  partial: ['Partial', 'bg-accent-blue-soft text-accent-blue'],
  setup_required: ['Setup required', 'bg-champagne-soft text-champagne-foreground'],
  planned: ['Planned', 'bg-muted text-muted-foreground'],
}

function FeatureRow({
  feature,
  defs,
  features,
  records,
}: {
  feature: FeatureDefinition
  defs: FeatureDefinition[]
  features: FeatureMap
  records: Records
}) {
  const [pending, startTransition] = useTransition()
  const [optimistic, setOptimistic] = useState<boolean | null>(null)
  const [confirming, setConfirming] = useState(false)
  const enabled = optimistic ?? features[feature.key]
  const availability = featureAvailability(feature)
  const badge = BADGES[availability]
  const message = rowMessage(defs, features, feature, featureLabel)
  const dependents = enabled ? activeDependents(defs, features, feature.key) : []
  const recordSummary = records[feature.key]
  const switchable = availability !== 'core' && availability !== 'planned' && !feature.includedWith
  const usable = canToggle(defs, features, feature)

  const apply = (next: boolean) => {
    setConfirming(false)
    setOptimistic(next)
    // Dependents first, deepest first, so the database dependency guard is never violated.
    const sequence: FeatureKey[] = next ? [feature.key] : [...dependents, feature.key]
    startTransition(async () => {
      for (const key of sequence) {
        const result = await setFeatureAction(key, next)
        if (result.error) {
          setOptimistic(null)
          toast.error(result.error)
          return
        }
      }
      setOptimistic(null)
      toast.success(
        sequence.length > 1
          ? `${sequence.map(featureLabel).join(' and ')} turned off.`
          : `${feature.label} ${next ? 'turned on' : 'turned off'}.`,
      )
    })
  }

  const toggle = () => {
    if (enabled && (recordSummary || dependents.length)) setConfirming(true)
    else apply(!enabled)
  }

  const id = `feature-${feature.key}`
  const showLink = feature.configHref && (availability === 'core' || availability === 'setup_required' || (switchable && enabled))
  const MessageIcon = message?.tone === 'warning' ? TriangleAlert : Info

  return (
    <li className="flex items-start justify-between gap-4 px-4 py-3 sm:px-5">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={switchable ? id : undefined} className="text-sm font-medium text-foreground">
            {feature.label}
          </label>
          {badge && <span className={cn('rounded-badge px-2 py-0.5 text-xs font-medium', badge[1])}>{badge[0]}</span>}
        </div>
        <p className={cn('text-sm text-muted-foreground', availability === 'planned' && 'text-muted-foreground/80')}>
          {feature.description}
        </p>
        {message && (
          <p
            className={cn(
              'flex items-start gap-1.5 text-xs',
              message.tone === 'warning' ? 'font-medium text-champagne-foreground' : 'text-muted-foreground',
            )}
          >
            <MessageIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            {message.text}
          </p>
        )}
        {showLink && (
          <Link
            href={feature.configHref!}
            className="flex w-fit items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
          >
            {feature.configLabel ?? 'Configure'}
            <ArrowUpRight className="size-3" aria-hidden="true" />
          </Link>
        )}
      </div>

      {availability === 'core' && (
        <span className="mt-0.5 flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground">
          <Lock className="size-3.5" aria-hidden="true" />
          Always on
        </span>
      )}
      {feature.includedWith && availability !== 'planned' && (
        <span
          className={cn(
            'mt-0.5 shrink-0 rounded-badge px-2 py-0.5 text-xs font-medium',
            features[feature.key] ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
          )}
        >
          {features[feature.key] ? 'On' : 'Off'}
        </span>
      )}
      {switchable && (
        <button
          id={id}
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={pending || !usable}
          onClick={toggle}
          className={cn(
            'relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
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
            <DialogTitle>
              {dependents.length
                ? `Turn off ${[feature.key, ...dependents].map(featureLabel).join(' and ')}?`
                : `Turn off ${feature.label}?`}
            </DialogTitle>
            <DialogDescription>
              {[
                dependents.length
                  ? `${dependents.map(featureLabel).join(' and ')} ${dependents.length > 1 ? 'depend' : 'depends'} on ${feature.label} and will be turned off first.`
                  : null,
                recordSummary ? `Your company has ${recordSummary} in this module.` : null,
                feature.disableNote ?? 'Records are hidden while the module is off.',
                'Nothing is deleted, and turning it back on restores access.',
              ]
                .filter(Boolean)
                .join(' ')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              Keep on
            </Button>
            <Button onClick={() => apply(false)}>{dependents.length ? `Turn off ${dependents.length + 1}` : 'Turn off'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  )
}
