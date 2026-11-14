'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ImageOff, Users } from 'lucide-react'
import { toast } from 'sonner'
import { PHOTO_SOURCE_LABELS, type LibraryPhoto, type PhotoView } from '@/lib/project-photo-library'
import { removeProjectPhotoAction, updateProjectPhotoDetailsAction } from '@/app/actions/project-photos'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

function formatPhotoDate(value: string) {
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function PhotoImage({ photo, className }: { photo: LibraryPhoto; className: string }) {
  if (!photo.url) {
    return (
      <div className={`flex items-center justify-center bg-muted text-muted-foreground ${className}`}>
        <ImageOff className="size-5" aria-hidden="true" />
        <span className="sr-only">Photo unavailable</span>
      </div>
    )
  }
  // eslint-disable-next-line @next/next/no-img-element -- signed storage URLs expire, so they bypass image optimization
  return <img src={photo.url} alt={photo.caption ?? photo.fileName} className={`object-cover ${className}`} loading="lazy" />
}

export function PhotoLibrary({
  projectId,
  photos,
  view,
  readOnly,
}: {
  projectId: string
  photos: LibraryPhoto[]
  view: PhotoView
  readOnly: boolean
}) {
  const [openKey, setOpenKey] = useState<string | null>(null)
  const active = photos.find((p) => p.key === openKey) ?? null

  return (
    <>
      {view === 'grid' ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {photos.map((photo) => (
            <li key={photo.key}>
              <button
                type="button"
                onClick={() => setOpenKey(photo.key)}
                className="group flex w-full flex-col overflow-hidden rounded-panel border border-border bg-card text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <PhotoImage photo={photo} className="aspect-square w-full transition-opacity group-hover:opacity-90" />
                <span className="flex flex-col gap-0.5 px-2.5 py-2">
                  <span className="truncate text-xs font-medium text-foreground">{photo.caption ?? photo.references[0]?.label ?? photo.fileName}</span>
                  <span className="text-xs text-muted-foreground">{`${PHOTO_SOURCE_LABELS[photo.source]} · ${formatPhotoDate(photo.date)}`}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-panel border border-border bg-card">
          {photos.map((photo) => (
            <li key={photo.key}>
              <button
                type="button"
                onClick={() => setOpenKey(photo.key)}
                className="flex w-full items-center gap-4 px-3 py-2.5 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <PhotoImage photo={photo} className="size-14 shrink-0 rounded-md" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium text-foreground">{photo.caption ?? photo.fileName}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {[photo.references.map((r) => r.label).join(', '), photo.location, photo.uploadedByName].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">{formatPhotoDate(photo.date)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={Boolean(active)} onOpenChange={(open) => !open && setOpenKey(null)}>
        <DialogContent className="sm:max-w-3xl">
          {active && <PhotoDetail key={active.key} photo={active} projectId={projectId} readOnly={readOnly} onClosed={() => setOpenKey(null)} />}
        </DialogContent>
      </Dialog>
    </>
  )
}

function PhotoDetail({
  photo,
  projectId,
  readOnly,
  onClosed,
}: {
  photo: LibraryPhoto
  projectId: string
  readOnly: boolean
  onClosed: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const editable = photo.editable && !readOnly

  function save(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await updateProjectPhotoDetailsAction({
        project_id: projectId,
        photo_id: photo.id,
        caption: String(formData.get('caption') ?? ''),
        location: String(formData.get('location') ?? ''),
        phase: String(formData.get('phase') ?? ''),
        tags: String(formData.get('tags') ?? ''),
      })
      if (result.error) return setError(result.error)
      toast.success(result.success ?? 'Saved')
      router.refresh()
    })
  }

  function remove() {
    if (!window.confirm('Remove this photo from the project library?')) return
    setError(null)
    startTransition(async () => {
      const result = await removeProjectPhotoAction({ project_id: projectId, photo_id: photo.id })
      if (result.error) return setError(result.error)
      toast.success(result.success ?? 'Removed')
      onClosed()
      router.refresh()
    })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="truncate">{photo.caption ?? photo.fileName}</DialogTitle>
        <DialogDescription>
          {[formatPhotoDate(photo.date), photo.uploadedByName && `Added by ${photo.uploadedByName}`].filter(Boolean).join(' · ')}
        </DialogDescription>
      </DialogHeader>

      {photo.url ? (
        <a href={photo.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-panel bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
          <img src={photo.url} alt={photo.caption ?? photo.fileName} className="max-h-[60vh] w-full object-contain" />
          <span className="sr-only">Open full size in a new tab</span>
        </a>
      ) : (
        <PhotoImage photo={photo} className="h-48 w-full rounded-panel" />
      )}

      <div className="flex flex-wrap items-center gap-2">
        {photo.references.map((ref) =>
          ref.href ? (
            <Link key={`${ref.source}-${ref.label}`} href={ref.href} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
              {ref.label}
            </Link>
          ) : (
            <span key={`${ref.source}-${ref.label}`} className="text-sm text-foreground">
              {ref.label}
            </span>
          ),
        )}
        {photo.sharedWithHomeowner && (
          <Badge variant="secondary" className="gap-1">
            <Users className="size-3" aria-hidden="true" />
            Shared with homeowner
          </Badge>
        )}
        {photo.tags.map((tag) => (
          <Badge key={tag} variant="outline">
            {tag}
          </Badge>
        ))}
      </div>

      {editable ? (
        <form action={save} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="photo-caption">Caption</Label>
            <Textarea id="photo-caption" name="caption" defaultValue={photo.caption ?? ''} maxLength={300} rows={2} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="photo-location">Location</Label>
              <Input id="photo-location" name="location" defaultValue={photo.location ?? ''} maxLength={120} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="photo-phase">Phase</Label>
              <Input id="photo-phase" name="phase" defaultValue={photo.phase ?? ''} maxLength={120} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="photo-tags">Tags</Label>
              <Input id="photo-tags" name="tags" defaultValue={photo.tags.join(', ')} placeholder="Comma separated" />
            </div>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="outline" onClick={remove} disabled={pending}>
              Remove from library
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving...' : 'Save details'}
            </Button>
          </DialogFooter>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">
          {photo.source === 'direct'
            ? 'This project is read-only.'
            : `This photo belongs to a ${PHOTO_SOURCE_LABELS[photo.source].toLowerCase()}. Edit it there.`}
        </p>
      )}
    </>
  )
}
