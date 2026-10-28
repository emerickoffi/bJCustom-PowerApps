'use client'

import { useRef } from 'react'
import { ImagePlus as ImagePlusIcon, RefreshCw as RefreshIcon, Trash2 as TrashIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SelectField } from '@/components/shared/form-field'
import { ArchitecturalPlaceholder } from '@/components/projects/project-card'
import { createClient } from '@/lib/supabase/client'
import { MEDIA_BUCKET } from '@/lib/walkthroughs'
import {
  COVER_ACCEPT,
  COVER_KINDS,
  COVER_KIND_LABELS,
  coverPathForOrg,
  validateCoverFile,
} from '@/lib/project-cover'

/** Uploads straight to private storage so large images never pass through the server action body. */
export async function uploadProjectCover(orgId: string, file: File): Promise<{ path: string } | { error: string }> {
  const invalid = validateCoverFile(file)
  if (invalid) return { error: invalid }
  const path = coverPathForOrg(orgId, file.type)
  if (!path) return { error: 'Choose a JPG, PNG, or WebP image.' }
  const supabase = createClient()
  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false, cacheControl: '3600' })
  if (error) return { error: 'The cover image could not be uploaded. Please try again.' }
  return { path }
}

export function CoverImageField({
  previewUrl,
  fileName,
  kindDefault,
  error,
  onSelect,
  onRemove,
}: {
  /** Selected file preview, or the saved cover when nothing new is selected. */
  previewUrl: string | null
  fileName: string | null
  kindDefault: string
  error?: string
  onSelect: (file: File) => void
  onRemove: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const hasImage = Boolean(previewUrl)

  return (
    <div className="flex flex-col gap-5 sm:col-span-2">
      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <div className="relative aspect-[16/10] w-full shrink-0 overflow-hidden rounded-xl border border-border bg-muted md:w-80">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- local object URLs and short-lived signed URLs
            <img src={previewUrl} alt="Project cover image preview" className="size-full object-cover" />
          ) : (
            <ArchitecturalPlaceholder className="size-full bg-brand-deep" label="No cover image" />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <input
            ref={inputRef}
            id="cover_image"
            type="file"
            accept={COVER_ACCEPT}
            className="sr-only"
            aria-describedby="cover_image-hint"
            aria-invalid={error ? true : undefined}
            onChange={(e) => {
              const file = e.currentTarget.files?.[0]
              if (file) onSelect(file)
              e.currentTarget.value = ''
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
              {hasImage ? <RefreshIcon aria-hidden="true" /> : <ImagePlusIcon aria-hidden="true" />}
              {hasImage ? 'Replace image' : 'Upload image'}
            </Button>
            {hasImage && (
              <Button type="button" variant="ghost" onClick={onRemove} className="text-muted-foreground hover:text-destructive">
                <TrashIcon aria-hidden="true" />
                Remove image
              </Button>
            )}
          </div>
          {fileName && <p className="truncate text-sm text-foreground">{`Selected: ${fileName}`}</p>}
          <p id="cover_image-hint" className="text-xs leading-relaxed text-muted-foreground">
            JPG, PNG, or WebP, up to 10 MB. The image is uploaded when you save the project.
          </p>
          {error && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          )}
        </div>
      </div>

      <SelectField
        key={hasImage ? 'with-image' : 'no-image'}
        name="cover_image_kind"
        label="Image type"
        placeholder="Not specified"
        options={COVER_KINDS.map((k) => ({ value: k, label: COVER_KIND_LABELS[k] }))}
        defaultValue={hasImage ? kindDefault : ''}
        disabled={!hasImage}
        hint="Renderings and 3D visualizations are shown as a planned design, never as a finished home."
        className="max-w-sm"
      />
    </div>
  )
}
