import { z } from 'zod'
import { getSession } from '@/lib/session'
import { getEstimate } from '@/lib/estimate-queries'
import { getProposalPreview } from '@/lib/proposals-data'
import { proposalFilename } from '@/lib/proposals'
import { renderProposalPdf } from '@/lib/esign/proposal-pdf-render'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getSession()
  if (!session?.organizationId || !session.role || session.role === 'client' || session.activationRequired) {
    return new Response('Not found', { status: 404 })
  }
  if (!z.uuid().safeParse(id).success) return new Response('Not found', { status: 404 })

  const [estimate, preview] = await Promise.all([getEstimate(id, session.organizationId), getProposalPreview(id)])
  if (!estimate?.project || !preview) return new Response('Not found', { status: 404 })

  const bytes = await renderProposalPdf({
    estimate,
    proposal: preview.proposal,
    pricing: preview.pricing,
    brand: session.brand,
    generatedAt: new Date(),
    purpose: 'download',
  })
  const filename = proposalFilename({ projectNumber: estimate.project.project_number, estimateNumber: estimate.estimate_number, revision: estimate.revision })
  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
