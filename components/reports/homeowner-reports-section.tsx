import { createClient } from '@/lib/supabase/server'
import { HomeownerReportCard } from '@/components/reports/homeowner-report-card'

export async function HomeownerReportsSection({ walkthroughId, userId }: { walkthroughId: string; userId: string }) {
  const supabase = await createClient()
  const { data: reports } = await supabase
    .from('walkthrough_reports')
    .select('id, version, sha256, published_at, acknowledgment_requested_at, signoff_requested_at')
    .eq('walkthrough_id', walkthroughId)
    .not('published_at', 'is', null)
    .order('version', { ascending: false })
  if (!reports?.length) return null

  const { data: acks } = await supabase
    .from('report_acknowledgments')
    .select('report_id, decision, signer_name, created_at')
    .eq('user_id', userId)
    .in('report_id', reports.map((r) => r.id))
    .order('created_at', { ascending: false })

  return (
    <section aria-labelledby="portal-reports-heading" className="flex flex-col gap-4">
      <h2 id="portal-reports-heading" className="font-serif text-xl font-semibold text-foreground">
        Walkthrough report
      </h2>
      <ul className="flex flex-col gap-3">
        {reports.map((r, i) => (
          <HomeownerReportCard
            key={r.id}
            report={{
              id: r.id,
              version: r.version,
              sha256: r.sha256,
              publishedAt: r.published_at as string,
              approvalRequested: Boolean(r.acknowledgment_requested_at || r.signoff_requested_at),
              isLatest: i === 0,
            }}
            responses={(acks ?? []).filter((a) => a.report_id === r.id)}
          />
        ))}
      </ul>
    </section>
  )
}
