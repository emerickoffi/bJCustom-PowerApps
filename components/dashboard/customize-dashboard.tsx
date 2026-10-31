'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, Eye, EyeOff, Loader2, Lock, SlidersHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { saveDashboardLayoutAction, resetDashboardLayoutAction } from '@/app/actions/dashboard-layout'
import { moveWidget, type ResolvedWidget } from '@/lib/dashboard-layout'

type Editable = Pick<ResolvedWidget, 'id' | 'label' | 'description' | 'region' | 'locked' | 'visible'>

/**
 * Reorder and show/hide eligible widgets. Changes are a local draft until Save; closing the sheet or
 * pressing Cancel discards them. Restore default deletes the saved layout.
 */
export function CustomizeDashboard({ widgets, customized }: { widgets: Editable[]; customized: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Editable[]>(widgets)
  const [pending, startTransition] = useTransition()

  function onOpenChange(next: boolean) {
    if (next) setDraft(widgets)
    setOpen(next)
  }

  function run(task: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string) {
    startTransition(async () => {
      const result = await task()
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(success)
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger
        render={<Button variant="outline" size="sm" className="min-h-10" />}
        aria-label="Customize dashboard"
      >
        <SlidersHorizontal data-icon="inline-start" />
        Customize
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Customize dashboard</SheetTitle>
          <SheetDescription>Reorder or hide sections. Locked sections always stay visible.</SheetDescription>
        </SheetHeader>
        <ol className="flex flex-1 flex-col gap-2 overflow-y-auto px-4">
          {draft.map((w, i) => {
            const sameRegion = draft.filter((d) => d.region === w.region)
            const pos = sameRegion.findIndex((d) => d.id === w.id)
            return (
              <li key={w.id} className="flex items-center gap-3 rounded-xl border p-3" aria-label={w.label}>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className={w.visible ? 'font-medium' : 'font-medium text-muted-foreground line-through'}>{w.label}</span>
                  <span className="truncate text-xs text-muted-foreground">{w.description}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-10"
                    disabled={pos === 0}
                    onClick={() => setDraft((d) => moveWidget(d, w.id, -1))}
                    aria-label={`Move ${w.label} up`}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-10"
                    disabled={pos === sameRegion.length - 1}
                    onClick={() => setDraft((d) => moveWidget(d, w.id, 1))}
                    aria-label={`Move ${w.label} down`}
                  >
                    <ArrowDown />
                  </Button>
                  {w.locked ? (
                    <span className="flex size-10 items-center justify-center text-muted-foreground" title="Always visible">
                      <Lock className="size-4" aria-hidden="true" />
                      <span className="sr-only">Always visible</span>
                    </span>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-10"
                      aria-pressed={w.visible}
                      onClick={() => setDraft((d) => d.map((x, j) => (j === i ? { ...x, visible: !x.visible } : x)))}
                      aria-label={w.visible ? `Hide ${w.label}` : `Show ${w.label}`}
                    >
                      {w.visible ? <Eye /> : <EyeOff />}
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
        <SheetFooter className="flex-row flex-wrap gap-2 border-t">
          <Button
            variant="ghost"
            disabled={pending || !customized}
            onClick={() => run(resetDashboardLayoutAction, 'Default layout restored')}
          >
            Restore default
          </Button>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={pending}
              onClick={() => run(() => saveDashboardLayoutAction(draft.map((w) => ({ id: w.id, visible: w.visible }))), 'Dashboard saved')}
            >
              {pending && <Loader2 className="animate-spin" data-icon="inline-start" />}
              Save
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
