'use client'

import { useState, useTransition } from 'react'
import { FileText } from 'lucide-react'
import { getQuoteAttachmentUrlAction, getQuoteDocumentUrlAction } from '@/app/actions/subcontract-quotes'

type Props =
  | { kind: 'attachment'; path: string; label: string }
  | { kind: 'document'; requestId: string; versionId: string; label: string }

export function FileLink(props: Props) {
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null)
            const r =
              props.kind === 'attachment'
                ? await getQuoteAttachmentUrlAction(props.path)
                : await getQuoteDocumentUrlAction(props.requestId, props.versionId)
            if (!r.ok) setError(r.error)
            else window.open(r.url, '_blank', 'noopener,noreferrer')
          })
        }
        className="inline-flex min-h-9 items-center gap-1.5 text-left text-sm font-medium text-primary underline-offset-4 hover:underline disabled:opacity-60"
      >
        <FileText className="size-4 shrink-0" aria-hidden="true" />
        <span className="break-all">{props.label}</span>
      </button>
      {error ? <span role="alert" className="text-xs text-destructive">{error}</span> : null}
    </span>
  )
}
