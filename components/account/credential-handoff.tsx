'use client'

import { useState } from 'react'
import { Check, Copy, KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/format'

export function CredentialHandoff({ credential }: { credential: { email: string; password: string; expiresAt: string } }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(credential.password)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div role="status" className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-sage/40 p-4 text-sm">
      <p className="flex items-center gap-2 font-medium text-foreground">
        <KeyRound className="size-4" aria-hidden="true" />
        Temporary sign-in details
      </p>
      <dl className="flex flex-col gap-2">
        <div className="flex flex-col">
          <dt className="text-xs text-muted-foreground">Email</dt>
          <dd className="break-all font-medium text-foreground">{credential.email}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-xs text-muted-foreground">Temporary password</dt>
          <dd className="flex items-center gap-2">
            <code className="flex-1 break-all rounded-md bg-card px-2 py-1.5 font-mono text-sm text-foreground">
              {credential.password}
            </code>
            <Button type="button" variant="outline" size="sm" onClick={copy}>
              {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </dd>
        </div>
      </dl>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {`Expires ${formatDateTime(credential.expiresAt)}. They must set their own password at first sign-in before seeing any project data. This password is not stored and will not be shown again. Do not send it by email.`}
      </p>
    </div>
  )
}
