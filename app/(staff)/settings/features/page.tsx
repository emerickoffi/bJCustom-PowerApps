import type { Metadata } from 'next'
import { requireAdmin } from '@/lib/session'
import { getOrgFeatures, getOrgPlanSummary } from '@/lib/features'
import { getProviderConfig } from '@/lib/esign/dropbox-sign'
import { getAssistantProviderConfig } from '@/lib/ai/assistant-provider'
import { createClient } from '@/lib/supabase/server'
import { FEATURES, isSwitchable, type FeatureKey } from '@/lib/feature-registry'
import { planAllows, upgradeMessage } from '@/lib/plans-shared'
import { PlanSummaryCard } from '@/components/settings/plan-summary-card'
import { isMissingTableError } from '@/lib/subcontractors'
import { PageHeader, pageLayout } from '@/components/shared/page-header'
import { FeatureToggles } from '@/components/settings/feature-toggles'
import { SlidersHorizontal as SlidersHorizontalIcon } from 'lucide-react'
import { getQuickBooksStatus } from '@/lib/quickbooks'

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
  const [plan, features, subcontractorProbe, clientUpdatesProbe, changeOrderTableProbe, rfiTableProbe, photosTableProbe, registryProbe, ...counts] = await Promise.all([
    getOrgPlanSummary(session.organizationId),
    getOrgFeatures(session.organizationId),
    supabase.from('subcontractor_companies').select('id').eq('organization_id', session.organizationId).limit(1),
    supabase.from('client_updates').select('id').eq('organization_id', session.organizationId).limit(1),
    supabase.from('change_orders').select('id').eq('organization_id', session.organizationId).limit(1),
    supabase.from('project_rfis').select('id').eq('organization_id', session.organizationId).limit(1),
    supabase.from('project_photos').select('id').eq('organization_id', session.organizationId).limit(1),
    supabase.rpc('feature_registry'),
    ...RECORD_TABLES.map(([, table]) =>
      supabase.from(table).select('id', { count: 'exact', head: true }).eq('organization_id', session.organizationId),
    ),
  ])
  const registeredKeys = (registryProbe.data ?? []) as { feature_key: string }[]
  const changeOrdersRegistered = registeredKeys.some((r) => r.feature_key === 'change_orders')
  const records: Partial<Record<FeatureKey, string>> = {}
  RECORD_TABLES.forEach(([key, , noun], i) => {
    const n = counts[i].count ?? 0
    if (n > 0) records[key] = `${n} ${noun}`
  })

  const switchableKeys = FEATURES.filter(isSwitchable).map((f) => f.key)
  const planLocks: Partial<Record<FeatureKey, { plan: string | null; message: string }>> = {}
  if (plan) {
    for (const key of switchableKeys) {
      if (!planAllows(plan, key, switchableKeys)) {
        planLocks[key] = { plan: plan.upgrade_plans[key] ?? null, message: upgradeMessage(plan, key) }
      }
    }
  }

  return (
    <div className={pageLayout('form', 'max-w-5xl')}>
      <PageHeader icon={SlidersHorizontalIcon}
        title="Feature management"
        level={2}
      />
      {plan && <PlanSummaryCard plan={plan} />}
      <FeatureToggles features={features} records={records} planLocks={planLocks} pendingSetup={{
          e_signatures: !getProviderConfig().configured,
          quickbooks: !getQuickBooksStatus().credentialsConfigured,
          ai_assistant: !getAssistantProviderConfig().configured,
          ai_essentials: !getAssistantProviderConfig().configured || !registeredKeys.some((r) => r.feature_key === 'ai_essentials'),
          subcontractors: isMissingTableError(subcontractorProbe.error),
          client_updates: isMissingTableError(clientUpdatesProbe.error),
          change_orders: isMissingTableError(changeOrderTableProbe.error) || !changeOrdersRegistered,
          rfis: isMissingTableError(rfiTableProbe.error) || !registeredKeys.some((r) => r.feature_key === 'rfis'),
          project_photos: isMissingTableError(photosTableProbe.error) || !registeredKeys.some((r) => r.feature_key === 'project_photos'),
        }}
      />
    </div>
  )
}
