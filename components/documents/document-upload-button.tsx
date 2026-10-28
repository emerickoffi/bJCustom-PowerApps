'use client'

import { useState } from 'react'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DocumentUploadDialog } from '@/components/documents/document-upload-dialog'
import type { DocumentCategory } from '@/lib/documents'

export function DocumentUploadButton({
  projectId,
  canShare,
  defaultCategory,
}: {
  projectId: string
  canShare: boolean
  defaultCategory?: DocumentCategory
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Upload data-icon="inline-start" />
        Upload document
      </Button>
      <DocumentUploadDialog
        key={defaultCategory ?? 'none'}
        projectId={projectId}
        open={open}
        onOpenChange={setOpen}
        canShare={canShare}
        defaultCategory={defaultCategory}
      />
    </>
  )
}
