'use client'

import { useState } from 'react'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DocumentUploadDialog, type UploadProjectOption } from '@/components/documents/document-upload-dialog'
import type { AnyDocumentCategory, DocumentScope } from '@/lib/documents'

export function DocumentUploadButton({
  projectId,
  scope = 'project',
  projectOptions,
  canShare,
  defaultCategory,
  label = 'Upload document',
  variant = 'default',
}: {
  projectId?: string
  scope?: DocumentScope
  projectOptions?: UploadProjectOption[]
  canShare: boolean
  defaultCategory?: AnyDocumentCategory
  label?: string
  variant?: 'default' | 'outline'
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <Upload data-icon="inline-start" />
        {label}
      </Button>
      <DocumentUploadDialog
        key={`${scope}-${defaultCategory ?? 'none'}`}
        projectId={projectId}
        scope={scope}
        projectOptions={projectOptions}
        open={open}
        onOpenChange={setOpen}
        canShare={canShare && scope === 'project'}
        defaultCategory={defaultCategory}
      />
    </>
  )
}
