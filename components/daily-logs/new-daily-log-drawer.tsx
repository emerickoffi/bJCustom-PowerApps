'use client'

import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { AlertTriangle, ClipboardList, Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { getNewDailyLogOptionsAction } from '@/app/actions/daily-logs'
import { claimPendingPhotos, commitPendingPhotos, discardPendingPhotos, stagePendingPhotos } from '@/lib/daily-log-pending-photos'
import { uploadDailyLogPhotos } from '@/components/daily-logs/upload-daily-log-photos'
import { DailyLogForm, blankDailyLogDefaults, type DailyLogFormControl } from '@/components/daily-logs/daily-log-form'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'

export function NewDailyLogDrawer({ projectId, projectName }: { projectId: string; projectName: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const controlRef = useRef<DailyLogFormControl | null>(null)
  const keepRef = useRef<HTMLButtonElement>(null)

  const { data, error, mutate } = useSWR(open ? ['new-daily-log-options', projectId] : null, () => getNewDailyLogOptionsAction(projectId), {
    revalidateOnFocus: false,
  })

  const close = useCallback(() => {
    setConfirming(false)
    setOpen(false)
  }, [])

  // Cancel, the X button, Escape and outside clicks all come through here; changes are checked only now.
  const requestClose = useCallback(() => {
    const control = controlRef.current
    if (finishing || control?.isSaving()) return
    if (!control?.isDirty()) return close()
    setConfirming(true)
    requestAnimationFrame(() => keepRef.current?.focus())
  }, [close, finishing])

  const discardChanges = async () => {
    discardPendingPhotos(projectId)
    await controlRef.current?.discard()
    close()
  }

  // Runs only after the server confirms the draft. Staged photos upload to the new log before the drawer closes.
  const onSaved = useCallback(
    async (href: string) => {
      const logId = decodeURIComponent(href.split('/').pop() ?? '')
      const staged = claimPendingPhotos(projectId, logId)
      if (staged.length) {
        setFinishing(true)
        const captions = new Map(staged.map((p) => [p.file, p.caption.trim().slice(0, 300)]))
        const { failed } = await uploadDailyLogPhotos(projectId, logId, staged.map((p) => p.file), (file) => captions.get(file) ?? '')
        setFinishing(false)
        const retry = staged.filter((p) => failed.some((f) => f.item === p.file && f.retryable))
        if (retry.length) {
          // Hand the failed photos to the saved log page, which retries them through its normal upload flow.
          stagePendingPhotos(projectId, logId, retry)
          commitPendingPhotos()
          close()
          toast.warning('Draft saved. Some photos did not upload; retrying on the log page.')
          router.push(href)
          return
        }
      }
      close()
      toast.success('Daily log draft saved.')
      router.refresh()
    },
    [close, projectId, router],
  )

  const options = data && 'options' in data ? data.options : null
  const loadError = error ? 'Daily log options could not be loaded.' : data && 'error' in data ? data.error : null

  return (
    <Sheet open={open} onOpenChange={(next) => (next ? setOpen(true) : requestClose())}>
      <SheetTrigger render={<Button className="md:h-10" />}>
        <Plus className="size-4" aria-hidden="true" />
        New daily log
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 p-0 data-[side=right]:sm:max-w-[640px] data-[side=right]:lg:max-w-[680px]">
        <SheetHeader className="shrink-0 gap-1 border-b border-border/70 px-5 pt-5 pb-4 sm:px-6">
          <div className="flex items-center gap-3 pr-8">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-sage text-primary ring-1 ring-inset ring-primary/10" aria-hidden="true">
              <ClipboardList className="size-4.5" />
            </span>
            <div className="flex min-w-0 flex-col">
              <SheetTitle className="type-section-title text-foreground">New daily log</SheetTitle>
              <SheetDescription className="truncate">{projectName}</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {confirming && (
          <div
            role="alertdialog"
            aria-labelledby="dl-discard-title"
            aria-describedby="dl-discard-desc"
            className="flex shrink-0 flex-col gap-3 border-b border-amber-300/70 bg-amber-50 px-5 py-3 text-amber-950 sm:flex-row sm:items-center sm:px-6 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100"
          >
            <div className="flex flex-1 items-start gap-2 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <div className="flex flex-col">
                <p id="dl-discard-title" className="font-medium">
                  Discard unsaved changes?
                </p>
                <p id="dl-discard-desc">This daily log has not been saved.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button ref={keepRef} type="button" size="sm" variant="outline" className="bg-background" onClick={() => setConfirming(false)}>
                Keep editing
              </Button>
              <Button type="button" size="sm" variant="destructive" onClick={discardChanges}>
                Discard changes
              </Button>
            </div>
          </div>
        )}

        {finishing && (
          <p role="status" className="flex shrink-0 items-center gap-2 border-b border-border/70 bg-muted/40 px-5 py-2.5 text-sm text-muted-foreground sm:px-6">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Draft saved. Uploading photos...
          </p>
        )}

        {loadError ? (
          <div className="flex flex-col items-start gap-3 px-5 py-6 text-sm sm:px-6" role="alert">
            <p className="text-destructive">{loadError}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => mutate()}>
              Try again
            </Button>
          </div>
        ) : !options ? (
          <div className="flex items-center gap-2 px-5 py-6 text-sm text-muted-foreground sm:px-6" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Loading daily log form...
          </div>
        ) : (
          // Mounted per open, so a cancelled entry never carries into the next drawer.
          open && (
            <DailyLogForm
              projectId={projectId}
              defaults={blankDailyLogDefaults(options.today)}
              activities={options.activities}
              companies={options.companies}
              voice={options.voice}
              maxDate={options.maxDate}
              drawer={{ onCancel: requestClose, onSaved, controlRef }}
            />
          )
        )}
      </SheetContent>
    </Sheet>
  )
}
