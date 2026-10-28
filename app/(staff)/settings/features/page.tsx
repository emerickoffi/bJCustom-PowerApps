import type { Metadata } from 'next'
import { requireAdmin } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { getProviderConfig } from '@/lib/esign/dropbox-sign'
import { getAssistantProviderConfig } from '@/lib/ai/assistant-provider'
import { createClient } from '@/lib/supabase/server'
import type { FeatureKey } from '@/lib/feature-registry'
import { PageHeader } from '@/components/shared/page-header'
import { FeatureToggles } from '@/components/settings/feature-toggles'
import { SlidersHorizontal as SlidersHorizontalIcon } from 'lucide-react'

export const metadata: Metadata = { title: 'Feature management' }

const RECORD_TABLES: [FeatureKey, string, string][] = [
  ['schedule', 'schedule_activities', 'schedule activities'],
  ['estimates', 'estimates', 'estimates'],
  ['walkthroughs', 'walkthroughs', 'walkthroughs'],
  ['reports', 'walkthrough_reports', 'reports'],
  ['issues', 'project_issues', 'issues'],
  ['warranty', 'project_warranties', 'warranties'],
  ['portal', 'portal_accounts', 'homeowner accounts'],
  ['invoices', 'invoices', 'invoices'],
]

export default async function FeaturesPage() {
  const session = await requireAdmin()
  const supabase = await createClient()
  const [features, ...counts] = await Promise.all([
    getOrgFeatures(session.organizationId),
    ...RECORD_TABLES.map(([, table]) =>
      supabase.from(table).select('id', { count: 'exact', head: true }).eq('organization_id', session.organizationId),
    ),
  ])
  const records: Partial<Record<FeatureKey, string>> = {}
  RECORD_TABLES.forEach(([key, , noun], i) => {
    const n = counts[i].count ?? 0
    if (n > 0) records[key] = `${n} ${noun}`
  })

  return (
    <div className="flex max-w-5xl flex-col gap-8">
      <PageHeader icon={SlidersHorizontalIcon}
        title="Feature management"
        description="Turn modules on or off for your company. Turning a feature off hides it everywhere and blocks access in the database, but never deletes its data. Turning it back on restores everything."
        backHref="/settings"
        backLabel="Company settings"
      />
      <FeatureToggles features={features} records={records} pendingSetup={{
          e_signatures: !getProviderConfig().configured,
          ai_assistant: !getAssistantProviderConfig().configured,
        }}
      />
    </div>
  )
}
