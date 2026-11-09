'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FileSignature, FileText, Info, Loader2, Settings2 } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { SignatureBadge } from '@/components/signatures/signature-badge'
import { SignatureDialog, openSignatureState, type SignatureDialogState } from '@/components/signatures/signature-dialog'
import { prepareEstimateSigning } from '@/app/actions/estimate-signatures'
import { useEstimateDraft } from '@/components/estimates/estimate-draft-context'
import type { EstimateSigningBlock, EstimateSigningEligibility } from '@/lib/estimate-signing'
import type { EstimateSigningState } from '@/lib/esign/queries'
import { formatDateTime } from '@/lib/format'

const SETUP_BLOCKS: EstimateSigningBlock[] = ['documents_off', 'signatures_off', 'setup_required']

export function EstimateSignaturePanel({
  estimateId,
  projectId,
  revision,
  eligibility,
  signing,
  isAdmin,
  revisionNote,
}: {
  estimateId: string
  projectId: string | null
  revision: number
  eligibility: EstimateSigningEligibility
  signing: EstimateSigningState
  isAdmin: boolean
  revisionNote: string | null
}) {
  const router = useRouter()
  const [dialog, setDialog] = useState<SignatureDialogState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const { snapshot, summary } = signing

  const draft = useEstimateDraft()

  const open = () => {
    setError(null)
    if (snapshot) {
      setDialog(openSignatureState({ id: snapshot.documentId, name: snapshot.name }))
      return
    }
    startTransition(async () => {
      const saved = draft ? await draft.ensureSaved('prepare the signature document') : 'clean'
      if (saved === 'cancelled') return
      if (saved === 'failed') {
        setError('Your edits did not save, so no signature document was prepared. Fix the issue and try again.')
        return
      }
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

  const blocked = eligibility.eligible ? null : eligibility
  const setupRequired = blocked !== null && SETUP_BLOCKS.includes(blocked.block)
  const canOpen = snapshot
    ? blocked === null || (blocked.block !== 'permission' && !setupRequired)
    : blocked === null
  const label = pending ? 'Preparing signing copy...' : summary ? 'Manage signatures' : 'Request Signatures'

  const showReason = blocked && !(snapshot && canOpen)
  const hint = showReason
    ? blocked.reason
    : !snapshot && blocked === null
      ? `Saves a locked PDF of Revision ${revision}, then you choose signers.`
      : null

  return (
    <div aria-labelledby="esign-heading" role="group" className="flex flex-col gap-2 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <h3 id="esign-heading" className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <FileSignature className="size-4 text-primary" aria-hidden="true" />
            Electronic signature
          </h3>
          {summary ? (
            <SignatureBadge status={summary.status} signed={summary.signed} total={summary.total} className="shrink-0" />
          ) : (
            <span className="rounded-badge bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {setupRequired ? 'Setup required' : 'Not requested'}
            </span>
          )}
          {hint && (
            <span id="esign-reason" className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {showReason && <Info className="size-3.5 shrink-0" aria-hidden="true" />}
              {hint}
            </span>
          )}
        </div>
        {setupRequired ? (
          isAdmin && (
            <Link href="/settings/features" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
              <Settings2 data-icon="inline-start" />
              Signature settings
            </Link>
          )
        ) : (
          <Button
            type="button"
            size="sm"
            onClick={open}
            disabled={!canOpen || pending}
            aria-describedby={hint ? 'esign-reason' : undefined}
            variant={summary || !canOpen ? 'outline' : 'default'}
          >
            {pending ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <FileSignature data-icon="inline-start" />}
            {label}
          </Button>
        )}
      </div>

      {snapshot && (
        <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <FileText className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{`${snapshot.name} · saved ${formatDateTime(snapshot.createdAt)}`}</span>
          {projectId && (
            <Link
              href={`/projects/${projectId}/documents?category=estimates`}
              className="shrink-0 text-primary hover:underline"
            >
              View in Documents
            </Link>
          )}
        </p>
      )}

      {blocked && revisionNote && revisionNote !== blocked.reason && (
        <p className="text-xs text-muted-foreground">{revisionNote}</p>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <SignatureDialog state={dialog} onChange={setDialog} onClose={close} />
    </div>
  )
}
