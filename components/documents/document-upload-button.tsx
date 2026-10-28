'use client'

import { useCallback, useState } from 'react'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DocumentUploadDialog, type UploadProjectOption } from '@/components/documents/document-upload-dialog'
import { useOpenFromUrl } from '@/components/shared/use-open-from-url'
import type { DocumentScope } from '@/lib/documents'

export function DocumentUploadButton({
  projectId,
  scope = 'project',
  projectOptions,
  canShare,
  label = 'Upload document',
  variant = 'default',
  openFromUrl = false,
}: {
  projectId?: string
  scope?: DocumentScope
  projectOptions?: UploadProjectOption[]
  canShare: boolean
  label?: string
  variant?: 'default' | 'outline'
  /** Opens the dialog when the page is reached with `?upload=1` (used by Quick Actions). */
  openFromUrl?: boolean
}) {
  const [open, setOpen] = useState(false)
  const openDialog = useCallback(() => setOpen(true), [])
  useOpenFromUrl('upload', '1', openFromUrl, openDialog)
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <Upload data-icon="inline-start" />
        {label}
      </Button>
      <DocumentUploadDialog
        key={scope}
        projectId={projectId}
        scope={scope}
        projectOptions={projectOptions}
        open={open}
        onOpenChange={setOpen}
        canShare={canShare && scope === 'project'}
      />
    </>
  )
}
