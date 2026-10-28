'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CheckCircle2, Download, Loader2, PenLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getSignedPdfUrl, getSigningSession, syncAfterSigning, type MySignatureTask } from '@/app/actions/signatures'
import { SignatureBadge } from '@/components/signatures/signature-badge'
import { formatDateTime } from '@/lib/format'

export function PortalSignatureTasks({ tasks }: { tasks: MySignatureTask[] }) {
  const pending = tasks.filter((t) => t.canSignNow || (t.waitingReason && t.status !== 'signed'))
  const done = tasks.filter((t) => !pending.includes(t)).slice(0, 5)
  if (!tasks.length) return null
  return (
    <section aria-labelledby="sign-heading" className="flex flex-col gap-3 rounded-xl border border-[#E2E8E2] bg-card p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-lg bg-[#EAF0E9] text-primary">
          <PenLine className="size-4" aria-hidden="true" />
        </span>
        <div>
          <h2 id="sign-heading" className="font-serif text-lg font-semibold text-foreground">Documents to sign</h2>
          <p className="text-xs text-muted-foreground">
            {pending.length ? `${pending.length} waiting for your signature` : 'You are all caught up.'}
          </p>
        </div>
      </div>
      <ul className="flex flex-col divide-y divide-[#E2E8E2]">
        {[...pending, ...done].map((t) => (
          <TaskRow key={t.signerId} task={t} />
        ))}
      </ul>
    </section>
  )
}

function TaskRow({ task: t }: { task: MySignatureTask }) {
  const router = useRouter()
  const [busy, start] = useTransition()
  const [opening, setOpening] = useState(false)

  const sign = async () => {
    setOpening(true)
    const res = await getSigningSession(t.signerId)
    if (!res.ok) {
      setOpening(false)
      return toast.error(res.error)
    }
    const { default: HelloSign } = await import('hellosign-embedded')
    const client = new HelloSign({ clientId: res.data.clientId })
    let signed = false
    client.on('sign', () => {
      signed = true
    })
    client.on('error', () => toast.error('The signing window reported a problem. Please try again.'))
    client.on('close', () => {
      setOpening(false)
      start(async () => {
        await syncAfterSigning(t.signerId)
        if (signed) toast.success('Thank you. Your signature was recorded.')
        router.refresh()
      })
    })
    client.open(res.data.signUrl, { testMode: res.data.testMode, skipDomainVerification: res.data.testMode, allowCancel: true })
  }

  const download = async () => {
    const res = await getSignedPdfUrl(t.requestId, 'download')
    if (!res.ok) return toast.error(res.error)
    window.location.assign(res.data.url)
  }

  return (
    <li
      id={`sign-${t.signerId}`}
      tabIndex={-1}
      className="flex scroll-mt-28 flex-wrap items-center justify-between gap-3 rounded-md py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring target:bg-sage/40 target:px-3"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <p className="truncate font-medium text-foreground">{t.title}</p>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <SignatureBadge status={t.requestStatus} />
          {t.status === 'signed' && t.signedAt && (
            <span className="flex items-center gap-1 text-success">
              <CheckCircle2 className="size-3" aria-hidden="true" />
              {`You signed ${formatDateTime(t.signedAt)}`}
            </span>
          )}
          {t.waitingReason && <span>{t.waitingReason}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {t.hasSignedPdf && (
          <Button size="sm" variant="outline" onClick={() => void download()}>
            <Download aria-hidden="true" /> Signed copy
          </Button>
        )}
        {t.canSignNow && (
          <Button size="sm" onClick={() => void sign()} disabled={opening || busy}>
            {opening || busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <PenLine aria-hidden="true" />}
            Review and sign
          </Button>
        )}
      </div>
    </li>
  )
}
