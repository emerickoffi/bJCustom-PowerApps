'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ArrowUpRight,
  ClipboardList,
  FileBarChart,
  Home,
  Lock,
  ShieldCheck,
  Sparkles,
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
import { cn } from '@/lib/utils'

const GROUPS: { name: FeatureGroup; icon: LucideIcon; note?: string }[] = [
  { name: 'Clients & contacts', icon: Users },
  { name: 'Project workflow', icon: ClipboardList },
  { name: 'Homeowner experience', icon: Home },
  { name: 'After completion', icon: ShieldCheck },
  { name: 'Finance', icon: Wallet },
  { name: 'AI & automation', icon: Sparkles, note: 'AI never writes or sends anything without your approval, and it only sees data your role already allows.' },
  { name: 'Reporting & exports', icon: FileBarChart, note: 'Walkthrough reports are under Project workflow, and estimate PDFs come with Estimates.' },
]

type Records = Partial<Record<FeatureKey, string>>

export function FeatureToggles({
  features,
  records,
  pendingSetup = {},
}: {
  features: FeatureMap
  records: Records
  /** Features whose runtime credentials are missing. Unlike static setupRequired, the switch stays usable. */
  pendingSetup?: Partial<Record<FeatureKey, boolean>>
}) {
  return (
    <div className="flex flex-col gap-8">
      {GROUPS.map(({ name: group, icon: Icon, note }) => (
        <section key={group} aria-labelledby={`group-${group}`} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 id={`group-${group}`} className="flex items-center gap-2 font-serif text-lg font-semibold text-foreground">
              <span className="flex size-7 items-center justify-center rounded-md bg-secondary text-primary">
                <Icon className="size-4" aria-hidden="true" />
              </span>
              {group}
            </h2>
            {note && <p className="text-xs text-muted-foreground">{note}</p>}
          </div>
          <ul className="surface divide-y">
            {FEATURES.filter((f) => f.group === group).map((f) => (
              <FeatureRow
                key={f.key}
                feature={pendingSetup[f.key] ? { ...f, setupRequired: true } : f}
                features={features}
                recordSummary={records[f.key]}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function StatusBadge({ feature, enabled }: { feature: FeatureDefinition; enabled: boolean }) {
  const [label, tone] = feature.core
    ? ['Core', 'bg-secondary text-primary']
    : feature.setupRequired
    ? ['Setup required', 'bg-champagne-soft text-warning']
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
  const blockedReason = !feature.available || feature.core
    ? null
    : !enabled && feature.setupRequired && feature.lockWhenSetupRequired
      ? 'Finish setup before turning this on'
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
    <li className="flex items-start justify-between gap-4 p-4 sm:gap-6 sm:p-5">
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={id} className="font-medium text-foreground">
            {feature.label}
          </label>
          <StatusBadge feature={feature} enabled={enabled} />
          {blockedReason && (
            <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              <Lock className="size-3" aria-hidden="true" />
              Locked by dependency
            </span>
          )}
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
        {feature.requires.length > 0 && (
          <p className="text-xs text-muted-foreground">{`Requires ${feature.requires.map(featureLabel).join(', ')}`}</p>
        )}
        {blockedReason && <p className="text-xs font-medium text-warning">{blockedReason}</p>}
        {feature.setupRequired && feature.setupNote && (
          <p className="text-xs font-medium text-warning">{feature.setupNote}</p>
        )}
        {feature.core && feature.coreNote && (
          <p className="text-xs text-muted-foreground">{feature.coreNote}</p>
        )}
        {((feature.available && enabled) || feature.setupRequired || feature.core) && feature.configHref && (
          <Link
            href={feature.configHref}
            className="flex w-fit items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
          >
            {feature.configLabel ?? 'Configure'}
            <ArrowUpRight className="size-3" aria-hidden="true" />
          </Link>
        )}
      </div>
      {feature.core && (
        <span className="mt-1 flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground">
          <Lock className="size-3.5" aria-hidden="true" />
          Always on
        </span>
      )}
      {feature.available && !feature.core && (
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
