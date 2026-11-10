'use client'

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState, type RefObject } from 'react'
import { Camera, ImagePlus, Save } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { FloatingActionSlot } from '@/components/app/floating-actions'

/**
 * A photo destination owned by an existing module uploader. The floating camera never
 * uploads on its own: it opens that uploader's own file inputs, so validation, storage
 * paths, registration actions and RLS all stay with the module.
 */
type CaptureTarget = {
  kind: 'capture'
  id: string
  label: string
  disabled: boolean
  camera: RefObject<HTMLInputElement | null>
  gallery: RefObject<HTMLInputElement | null>
  inline: RefObject<HTMLElement | null>
}

/**
 * A record that must be saved before photos can attach (e.g. an unsaved daily log).
 * Selecting it runs the module's own save; the module then routes to its uploader.
 */
type SaveFirstTarget = {
  kind: 'save-first'
  id: string
  label: string
  actionLabel: string
  disabled: boolean
  onSelect: () => void
  inline: RefObject<HTMLElement | null>
}

type CameraTarget = CaptureTarget | SaveFirstTarget

type Registry = { upsert: (target: CameraTarget) => void; remove: (id: string) => void }

const FloatingCameraContext = createContext<Registry | null>(null)

export function FloatingCameraProvider({ children }: { children: React.ReactNode }) {
  const [targets, setTargets] = useState<CameraTarget[]>([])
  const upsert = useCallback((target: CameraTarget) => {
    setTargets((prev) => {
      const at = prev.findIndex((t) => t.id === target.id)
      if (at === -1) return [...prev, target]
      const next = prev.slice()
      next[at] = target
      return next
    })
  }, [])
  const remove = useCallback((id: string) => setTargets((prev) => prev.filter((t) => t.id !== id)), [])
  const registry = useMemo(() => ({ upsert, remove }), [upsert, remove])

  return (
    <FloatingCameraContext.Provider value={registry}>
      {children}
      <FloatingCameraButton targets={targets} />
    </FloatingCameraContext.Provider>
  )
}

/**
 * Offers an uploader as a floating-camera destination. Callers pass `enabled` only when
 * the current user can add photos to this record (editable, not locked, under limits).
 * Outside a provider (e.g. the homeowner portal) this is a no-op.
 */
export function useFloatingCameraTarget({
  label,
  enabled,
  disabled = false,
  camera,
  gallery,
  inline,
}: {
  label: string | undefined
  enabled: boolean
  disabled?: boolean
  camera: RefObject<HTMLInputElement | null>
  gallery: RefObject<HTMLInputElement | null>
  inline: RefObject<HTMLElement | null>
}) {
  const registry = useContext(FloatingCameraContext)
  const id = useId()
  useEffect(() => {
    if (!registry || !enabled || !label) return
    registry.upsert({ kind: 'capture', id, label, disabled, camera, gallery, inline })
    return () => registry.remove(id)
  }, [registry, id, label, enabled, disabled, camera, gallery, inline])
}

/**
 * Offers an explicit "save, then add photos" action for a record that does not exist yet.
 * Nothing is saved until the user picks the menu item; `onSelect` must be stable.
 */
export function useFloatingCameraSaveFirst({
  label,
  actionLabel,
  enabled,
  disabled = false,
  onSelect,
  inline,
}: {
  label: string
  actionLabel: string
  enabled: boolean
  disabled?: boolean
  onSelect: () => void
  inline: RefObject<HTMLElement | null>
}) {
  const registry = useContext(FloatingCameraContext)
  const id = useId()
  useEffect(() => {
    if (!registry || !enabled) return
    registry.upsert({ kind: 'save-first', id, label, actionLabel, disabled, onSelect, inline })
    return () => registry.remove(id)
  }, [registry, id, label, actionLabel, enabled, disabled, onSelect, inline])
}

/** Tracks which targets currently have their own inline photo controls on screen. */
function useInlineControlsInView(targets: CameraTarget[]) {
  const [inView, setInView] = useState<ReadonlySet<string>>(new Set())
  useEffect(() => {
    const byElement = new Map<Element, string>()
    for (const t of targets) if (t.inline.current) byElement.set(t.inline.current, t.id)
    if (!byElement.size || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) =>
        setInView((prev) => {
          const live = new Set(byElement.values())
          const next = new Set([...prev].filter((id) => live.has(id)))
          for (const entry of entries) {
            const id = byElement.get(entry.target)
            if (!id) continue
            if (entry.isIntersecting) next.add(id)
            else next.delete(id)
          }
          return next
        }),
      { rootMargin: '-64px 0px 0px 0px', threshold: 0.6 },
    )
    byElement.forEach((_, el) => observer.observe(el))
    return () => observer.disconnect()
  }, [targets])
  return inView
}

function FloatingCameraButton({ targets }: { targets: CameraTarget[] }) {
  const [open, setOpen] = useState(false)
  const inView = useInlineControlsInView(targets)
  const inlineVisible = targets.some((t) => inView.has(t.id))

  if (!targets.length) return null

  // Stay mounted while the module's inline controls are on screen: unmounting on every
  // observer flip made the hit target vanish mid-scroll and swallowed taps.
  const stepAside = inlineVisible && !open

  return (
    <FloatingActionSlot
      slot="camera"
      inert={stepAside}
      aria-hidden={stepAside || undefined}
      className={cn('transition-opacity duration-150', stepAside && 'pointer-events-none opacity-0')}
    >
      <span
        role="presentation"
        className={cn(
          'pointer-events-none absolute right-full top-1/2 mr-3 -translate-y-1/2 whitespace-nowrap rounded-lg bg-brand-deep px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-md transition-opacity',
          !open && 'group-hover:opacity-100 group-has-[:focus-visible]:opacity-100',
        )}
      >
        Take Photo
      </span>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger
          aria-label="Take or upload photo"
          className={cn(
            'flex size-11 cursor-pointer touch-manipulation select-none items-center justify-center rounded-full border border-primary/20 bg-white text-primary shadow-sm transition-colors [-webkit-tap-highlight-color:transparent]',
            'hover:border-primary/40 hover:bg-sage/60',
            'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25',
            open && 'border-primary/40 bg-sage/60',
          )}
        >
          <Camera className="pointer-events-none size-5" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="left" align="end" sideOffset={12} className="w-56">
          {targets.map((target, index) => (
            <DropdownMenuGroup key={target.id}>
              {index > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
                {target.label}
              </DropdownMenuLabel>
              {target.kind === 'save-first' ? (
                <DropdownMenuItem disabled={target.disabled} onClick={target.onSelect}>
                  <Save aria-hidden="true" />
                  {target.actionLabel}
                </DropdownMenuItem>
              ) : (
                <>
                  <DropdownMenuItem disabled={target.disabled} onClick={() => target.camera.current?.click()}>
                    <Camera aria-hidden="true" />
                    Take Photo
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={target.disabled} onClick={() => target.gallery.current?.click()}>
                    <ImagePlus aria-hidden="true" />
                    Upload from Gallery
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuGroup>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </FloatingActionSlot>
  )
}
