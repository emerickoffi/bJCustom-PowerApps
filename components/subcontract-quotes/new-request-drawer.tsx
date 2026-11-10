'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Plus, XIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useLauncherAction } from '@/components/app/floating-actions'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { RequestForm } from '@/components/subcontract-quotes/request-form'
import { CurrencyPanel } from '@/components/subcontract-quotes/currency-panel'
import type { DraftInput } from '@/app/actions/subcontract-quotes'
import type { ActivityOption, CompanyOption, DocumentOption } from '@/lib/subcontract-quotes-data'

type Props = {
  projectId: string
  projectName: string
  currency: string | null
  initial: DraftInput
  companies: CompanyOption[]
  documents: DocumentOption[]
  activities: ActivityOption[]
}

export function NewQuoteRequestDrawer({ projectId, projectName, currency, initial, companies, documents, activities }: Props) {
  const [open, setOpen] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)
  const openerRef = useRef<HTMLAnchorElement | null>(null)
  const keepEditingRef = useRef<HTMLButtonElement | null>(null)
  const href = `/projects/${projectId}/subcontractor-work/quotes/new`

  const close = useCallback(() => {
    setConfirmingDiscard(false)
    setDirty(false)
    setOpen(false)
  }, [])

  // Every close path (X, Cancel, Escape, outside click) funnels through here.
  const requestClose = () => {
    if (busy) return false
    if (dirty) {
      setConfirmingDiscard(true)
      return false
    }
    close()
    return true
  }

  useEffect(() => {
    if (confirmingDiscard) keepEditingRef.current?.focus()
  }, [confirmingDiscard])

  useEffect(() => {
    if (!open || !dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [open, dirty])

  useLauncherAction({ id: 'quote-request', label: 'New quote request', icon: 'quote', onSelect: () => setOpen(true) })

  const onSent = useCallback(() => {
    close()
    toast.success('Quote request sent.')
  }, [close])

  return (
    <>
      <Link
        ref={openerRef}
        href={href}
        aria-haspopup="dialog"
        onClick={(e) => {
          // Modified clicks keep the direct route (new tab/window).
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
          e.preventDefault()
          setOpen(true)
        }}
        className="inline-flex h-9 items-center gap-2 rounded-md border border-action-border bg-action font-semibold text-action-foreground hover:bg-action-hover active:bg-action-pressed px-4 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <Plus className="size-4" aria-hidden="true" />
        New quote request
      </Link>

      <Sheet
        open={open}
        onOpenChange={(next, details) => {
          if (next) return setOpen(true)
          if (!requestClose()) details.cancel()
        }}
      >
        <SheetContent
          side="right"
          showCloseButton={false}
          finalFocus={openerRef}
          className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:border-l-0 data-[side=right]:sm:max-w-none motion-reduce:transition-none lg:data-[side=right]:w-[min(640px,calc(100vw-2rem))] lg:data-[side=right]:border-l"
        >
          <header className="flex shrink-0 items-start gap-3 border-b border-border py-3 pr-2 pl-5 pt-[max(0.75rem,env(safe-area-inset-top))] sm:pl-6">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-1.5">
              <SheetTitle className="font-serif text-xl font-semibold text-foreground">New quote request</SheetTitle>
              <SheetDescription className="truncate">
                {reviewing ? `Review before sending · ${projectName}` : projectName}
              </SheetDescription>
            </div>
            <SheetClose
              render={<Button type="button" variant="ghost" size="icon" className="size-11 shrink-0" />}
              aria-label="Close new quote request"
              disabled={busy}
            >
              <XIcon className="size-5" aria-hidden="true" />
            </SheetClose>
          </header>

          <RequestForm
            projectId={projectId}
            requestId={null}
            rowVersion={null}
            currency={currency}
            initial={initial}
            companies={companies}
            documents={documents}
            activities={activities}
            drawer={{
              topSlot: currency ? null : <CurrencyPanel projectId={projectId} />,
              footerOverride: confirmingDiscard ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p role="alert" className="text-sm font-medium text-foreground">
                    Discard unsaved changes?
                  </p>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button ref={keepEditingRef} type="button" variant="outline" onClick={() => setConfirmingDiscard(false)}>
                      Keep editing
                    </Button>
                    <Button type="button" variant="destructive" onClick={close}>
                      Discard
                    </Button>
                  </div>
                </div>
              ) : undefined,
              onCancel: () => void requestClose(),
              onSent,
              onDirtyChange: setDirty,
              onBusyChange: setBusy,
              onReviewChange: setReviewing,
            }}
          />
        </SheetContent>
      </Sheet>
    </>
  )
}
