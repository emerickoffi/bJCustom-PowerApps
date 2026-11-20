'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, LogIn, LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/shared/form-field'
import { clockInAction, clockOutAction } from '@/app/actions/time'
import { TIME_COST_CATEGORIES, elapsedMinutes, formatMinutes } from '@/lib/time-tracking'

type Project = { id: string; name: string; project_number: string | null }

export type OpenClock = { started_at: string; project_name: string; cost_category: string; started_label: string }

export function ClockCard({ projects, open, defaultProjectId }: { projects: Project[]; open: OpenClock | null; defaultProjectId?: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [projectId, setProjectId] = useState(defaultProjectId ?? projects[0]?.id ?? '')
  const [category, setCategory] = useState<string>('Other')
  const [breakMinutes, setBreakMinutes] = useState('0')
  const [notes, setNotes] = useState('')
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    if (!open) return
    const t = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(t)
  }, [open])

  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const r = await fn()
      if (r.ok) {
        toast.success(r.message ?? 'Saved.')
        setNotes('')
        setBreakMinutes('0')
        router.refresh()
      } else toast.error(r.error ?? 'Try again.')
    })

  if (open) {
    const minutes = elapsedMinutes(open.started_at, now)
    return (
      <section aria-labelledby="clock-heading" className="surface flex flex-col gap-4 border-l-4 border-l-primary p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="clock-heading" className="flex items-center gap-2 type-section-title text-foreground">
              <span className="relative flex size-2.5" aria-hidden="true">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60 motion-reduce:animate-none" />
                <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
              </span>
              Clocked in
            </h2>
            <p className="text-sm text-muted-foreground">
              {open.project_name} · {open.cost_category} · since {open.started_label}
            </p>
          </div>
          <p className="text-3xl font-semibold tabular-nums text-foreground" aria-live="polite">
            {formatMinutes(minutes)}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="clock-break">Break (minutes)</Label>
            <Input id="clock-break" inputMode="numeric" value={breakMinutes} onChange={(e) => setBreakMinutes(e.target.value.replace(/\D/g, '').slice(0, 3))} className="h-11" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="clock-notes">What did you work on? (optional)</Label>
            <Input id="clock-notes" value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} className="h-11" />
          </div>
        </div>
        <Button size="lg" className="h-12 w-full sm:w-auto" disabled={pending} onClick={() => run(() => clockOutAction({ breakMinutes: Number(breakMinutes || 0), notes }))}>
          <LogOut className="size-4" aria-hidden="true" />
          {pending ? 'Clocking out…' : 'Clock out'}
        </Button>
        {minutes > 16 * 60 && (
          <p className="rounded-xl bg-champagne-soft px-4 py-3 text-sm text-foreground">
            This clock has been running a long time. If you forgot to clock out, use &ldquo;Add time&rdquo; below after clocking out, or ask a manager to fix the end time.
          </p>
        )}
      </section>
    )
  }

  if (!projects.length) {
    return (
      <section className="surface flex flex-col gap-2 p-5 md:p-6">
        <h2 className="type-section-title text-foreground">Clock in</h2>
        <p className="text-sm text-muted-foreground">You aren&apos;t assigned to any active projects yet. Ask a manager to add you to a project.</p>
      </section>
    )
  }

  return (
    <section aria-labelledby="clock-heading" className="surface flex flex-col gap-4 p-5 md:p-6">
      <h2 id="clock-heading" className="flex items-center gap-2 type-section-title text-foreground">
        <Clock className="size-5 text-primary" aria-hidden="true" />
        Clock in
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="clock-project">Project</Label>
          <NativeSelect id="clock-project" value={projectId} onChange={(e) => setProjectId(e.target.value)} className="h-11">
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.project_number ? `${p.project_number} · ${p.name}` : p.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="clock-category">Cost code</Label>
          <NativeSelect id="clock-category" value={category} onChange={(e) => setCategory(e.target.value)} className="h-11">
            {TIME_COST_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <Button size="lg" className="h-12 w-full sm:w-auto" disabled={pending || !projectId} onClick={() => run(() => clockInAction({ projectId, category }))}>
        <LogIn className="size-4" aria-hidden="true" />
        {pending ? 'Clocking in…' : 'Clock in'}
      </Button>
    </section>
  )
}
