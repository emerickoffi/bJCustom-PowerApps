'use client'

import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { ExternalLink, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FormOverlay, OverlayBody, OverlayFooter, useFormOverlay } from '@/components/shared/form-overlay'

/**
 * A plain primary click opens the record panel. Modifier clicks (new tab, new window)
 * and middle clicks fall through to the link's full-page href.
 */
export function isPlainClick(e: React.MouseEvent) {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey
}

/**
 * Standard record preview: a side drawer on tablet and desktop, full screen on phones.
 * Closing returns focus to the row that opened it, and unsaved panel edits are guarded
 * by the underlying FormOverlay before the panel closes or leaves for the full page.
 */
export function RecordPanel({
  open,
  onClose,
  icon,
  title,
  description,
  fullHref,
  fullLabel = 'Open full details',
  actions,
  size,
  children,
}: {
  open: boolean
  onClose: () => void
  icon?: LucideIcon
  title: React.ReactNode
  description?: React.ReactNode
  /** Omit when the record has no full-page view. */
  fullHref?: string
  fullLabel?: string
  /** Extra footer actions, placed between Close and the full-details link. */
  actions?: React.ReactNode
  size?: 'md' | 'lg'
  children: React.ReactNode
}) {
  return (
    <FormOverlay open={open} onClose={onClose} variant="drawer" size={size} icon={icon} title={title} description={description}>
      {open && (
        <>
          <OverlayBody className="flex flex-col gap-6">{children}</OverlayBody>
          <RecordPanelFooter fullHref={fullHref} fullLabel={fullLabel} actions={actions} />
        </>
      )}
    </FormOverlay>
  )
}

export function RecordPanelFooter({
  fullHref,
  fullLabel = 'Open full details',
  actions,
}: {
  fullHref?: string
  fullLabel?: string
  actions?: React.ReactNode
}) {
  const overlay = useFormOverlay()
  return (
    <OverlayFooter actionsClassName="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
      <Button type="button" variant="ghost" size="lg" onClick={() => overlay?.requestClose()}>
        Close
      </Button>
      {actions}
      {fullHref && (
        <Button
          size="lg"
          nativeButton={false}
          render={
            <Link
              href={fullHref}
              onClick={(e) => {
                if (!overlay?.dirty) return
                e.preventDefault()
                overlay.requestClose()
              }}
            />
          }
        >
          <ExternalLink data-icon="inline-start" />
          {fullLabel}
        </Button>
      )}
    </OverlayFooter>
  )
}

export function PanelSection({
  title,
  aside,
  children,
}: {
  title: string
  aside?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  )
}

export function PanelLoading({ label }: { label: string }) {
  return (
    <div className="flex min-h-40 flex-1 items-center justify-center" role="status">
      <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>
  )
}

export function PanelError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
      <p role="alert">{message}</p>
      {onRetry && (
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw data-icon="inline-start" />
          Try again
        </Button>
      )}
    </div>
  )
}
