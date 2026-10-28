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

  const blocked = eligibility.eligible ? null : eligibility
  const setupRequired = blocked !== null && SETUP_BLOCKS.includes(blocked.block)
  const canOpen = snapshot
    ? blocked === null || (blocked.block !== 'permission' && !setupRequired)
    : blocked === null
  const label = pending ? 'Preparing signing copy...' : summary ? 'Manage signatures' : 'Request Signatures'

  return (
    <div aria-labelledby="esign-heading" role="group" className="flex flex-col gap-3 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="esign-heading" className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <FileSignature className="size-4 text-primary" aria-hidden="true" />
          {setupRequired ? 'Electronic Signatures — Setup Required' : 'Electronic signatures'}
        </h3>
        {summary ? (
          <SignatureBadge status={summary.status} signed={summary.signed} total={summary.total} className="shrink-0" />
        ) : (
          !setupRequired && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Not requested</span>
          )
        )}
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

      {blocked && !(snapshot && canOpen) && (
        <p id="esign-reason" className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {blocked.reason}
        </p>
      )}

      {blocked && revisionNote && revisionNote !== blocked.reason && (
        <p className="text-xs leading-relaxed text-muted-foreground">{revisionNote}</p>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {!setupRequired && (
        <Button
          type="button"
          onClick={open}
          disabled={!canOpen || pending}
          aria-describedby={canOpen ? undefined : 'esign-reason'}
          variant={summary ? 'outline' : 'default'}
          className="w-full"
        >
          {pending ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <FileSignature data-icon="inline-start" />}
          {label}
        </Button>
      )}

      {setupRequired && isAdmin && (
        <Link href="/settings/features" className={cn(buttonVariants({ variant: 'outline' }), 'w-full')}>
          <Settings2 data-icon="inline-start" />
          Open signature settings
        </Link>
      )}

      {!snapshot && blocked === null && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {`Saves a locked PDF of Revision ${revision} to Project Documents, then lets you choose signers. Retrying reuses the same copy.`}
        </p>
      )}

      <SignatureDialog state={dialog} onChange={setDialog} onClose={close} />
    </div>
  )
}
