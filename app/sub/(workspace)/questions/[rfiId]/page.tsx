import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { MessageCircleQuestion } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { requireSubcontractor } from '@/lib/subcontractor-session'
import { createClient } from '@/lib/supabase/server'
import { SubRfiDetail } from '@/components/rfis/sub-rfi-detail'

export const metadata: Metadata = { title: 'Question' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Row = { id: string; rfi_number: number; subject: string; project_name: string }

/** Where a subcontractor's RFI notification and email lead. */
export default async function SubQuestionPage({ params }: { params: Promise<{ rfiId: string }> }) {
  await requireSubcontractor()
  const { rfiId } = await params
  if (!UUID.test(rfiId)) notFound()
  const supabase = await createClient()
  const { data } = await supabase.rpc('my_assigned_rfis')
  const row = ((data ?? []) as Row[]).find((r) => r.id === rfiId.toLowerCase())

  return (
    <>
      <PageHeader
        icon={MessageCircleQuestion}
        title={row ? `RFI ${row.rfi_number}: ${row.subject}` : 'Question'}
        eyebrow={row?.project_name}
        backHref="/sub/questions"
        backLabel="Questions"
      />
      <SubRfiDetail rfiId={rfiId.toLowerCase()} />
    </>
  )
}
