'use client'

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState, type RefObject } from 'react'
import { Camera, ImagePlus } from 'lucide-react'
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
import { FLOATING_ABOVE_ASSISTANT, FLOATING_CORNER_SECONDARY, type FloatingPlacement } from '@/lib/floating-actions'

/**
 * A photo destination owned by an existing module uploader. The floating camera never
 * uploads on its own: it opens that uploader's own file inputs, so validation, storage
 * paths, registration actions and RLS all stay with the module.
 */
type CameraTarget = {
  id: string
  label: string
  disabled: boolean
  camera: RefObject<HTMLInputElement | null>
  gallery: RefObject<HTMLInputElement | null>
  inline: RefObject<HTMLElement | null>
}

type Registry = { upsert: (target: CameraTarget) => void; remove: (id: string) => void }

const FloatingCameraContext = createContext<Registry | null>(null)

export function FloatingCameraProvider({ placement, children }: { placement: FloatingPlacement; children: React.ReactNode }) {
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
      <FloatingCameraButton targets={targets} placement={placement} />
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
    registry.upsert({ id, label, disabled, camera, gallery, inline })
    return () => registry.remove(id)
  }, [registry, id, label, enabled, disabled, camera, gallery, inline])
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
          const next = new Set(prev)
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

function FloatingCameraButton({ targets, placement }: { targets: CameraTarget[]; placement: FloatingPlacement }) {
  const [open, setOpen] = useState(false)
  const inView = useInlineControlsInView(targets)
  const inlineVisible = targets.some((t) => inView.has(t.id))

  if (!targets.length || (inlineVisible && !open)) return null

  return (
    <div
      data-floating-control
      className={cn('group fixed z-40 print:hidden', placement === 'above-assistant' ? FLOATING_ABOVE_ASSISTANT : FLOATING_CORNER_SECONDARY)}
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
            'flex size-11 items-center justify-center rounded-full border border-primary/20 bg-white text-primary shadow-sm transition-colors',
            'hover:border-primary/40 hover:bg-sage/60',
            'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25',
            open && 'border-primary/40 bg-sage/60',
          )}
        >
          <Camera className="size-5" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="left" align="end" sideOffset={12} className="w-56">
          {targets.map((target, index) => (
            <DropdownMenuGroup key={target.id}>
              {index > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
                {target.label}
              </DropdownMenuLabel>
              <DropdownMenuItem disabled={target.disabled} onSelect={() => target.camera.current?.click()}>
                <Camera aria-hidden="true" />
                Take Photo
              </DropdownMenuItem>
              <DropdownMenuItem disabled={target.disabled} onSelect={() => target.gallery.current?.click()}>
                <ImagePlus aria-hidden="true" />
                Upload from Gallery
              </DropdownMenuItem>
            </DropdownMenuGroup>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
