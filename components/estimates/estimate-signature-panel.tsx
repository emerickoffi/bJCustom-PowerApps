'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FileSignature, FileText, Info, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SignatureBadge } from '@/components/signatures/signature-badge'
import { SignatureDialog, openSignatureState, type SignatureDialogState } from '@/components/signatures/signature-dialog'
import { prepareEstimateSigning } from '@/app/actions/estimate-signatures'
import type { EstimateSigningEligibility } from '@/lib/estimate-signing'
import type { EstimateSigningState } from '@/lib/esign/queries'
import { formatDateTime } from '@/lib/format'

export function EstimateSignaturePanel({
  estimateId,
  projectId,
  revision,
  eligibility,
  signing,
}: {
  estimateId: string
  projectId: string | null
  revision: number
  eligibility: EstimateSigningEligibility
  signing: EstimateSigningState
}) {
  const router = useRouter()
  const [dialog, setDialog] = useState<SignatureDialogState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const { snapshot, summary } = signing

  const open = () => {
    setError(null)
    if (snapshot) {
      setDialog(openSignatureState({ id: snapshot.documentId, name: snapshot.name }))
      return
    }
    startTransition(async () => {
      const result = await prepareEstimateSigning(estimateId)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setDialog(openSignatureState({ id: result.data.documentId, name: result.data.name }))
      router.refresh()
    })
  }

  const close = () => {
    setDialog(null)
    router.refresh()
  }

  const canOpen = snapshot ? eligibility.eligible || eligibility.block !== 'permission' : eligibility.eligible
  const label = pending
    ? 'Preparing signing copy...'
    : summary
      ? 'Manage signatures'
      : 'Request signatures'

  return (
    <section aria-labelledby="esign-heading" className="surface flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="esign-heading" className="flex items-center gap-2 font-serif text-lg font-semibold text-foreground">
            <FileSignature className="size-4 text-primary" aria-hidden="true" />
            Electronic signatures
          </h2>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {`Signers receive a locked PDF of Revision ${revision}, so the signed document always matches this exact version.`}
          </p>
        </div>
        {summary && <SignatureBadge status={summary.status} signed={summary.signed} total={summary.total} className="shrink-0" />}
      </div>

      {snapshot && (
        <div className="flex items-start gap-3 rounded-xl border bg-card p-3">
          <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-sm font-medium text-foreground">{snapshot.name}</span>
            <span className="text-xs text-muted-foreground">
              {`Signing copy saved ${formatDateTime(snapshot.createdAt)}`}
              {projectId && (
                <>
                  {' · '}
                  <Link href={`/projects/${projectId}/documents?category=estimates`} className="text-primary hover:underline">
                    View in Documents
                  </Link>
                </>
              )}
            </span>
          </div>
        </div>
      )}

      {!eligibility.eligible && !(snapshot && canOpen) && (
        <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {eligibility.reason}
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {canOpen && (
        <Button type="button" onClick={open} disabled={pending} variant={summary ? 'outline' : 'default'}>
          {pending ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <FileSignature data-icon="inline-start" />}
          {label}
        </Button>
      )}

      {!snapshot && eligibility.eligible && (
        <p className="text-xs text-muted-foreground">
          The first request saves the PDF to Project Documents under Estimates. Later requests reuse the same copy.
        </p>
      )}

      <SignatureDialog state={dialog} onChange={setDialog} onClose={close} />
    </section>
  )
}
