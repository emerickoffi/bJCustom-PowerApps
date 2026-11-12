import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { getClientOptions, getStaffMembers } from '@/lib/queries'
import { getOrgFeatures } from '@/lib/features'
import type {
  ClientMailingAddress,
  ProjectTemplateOption,
  StandardScheduleSummary,
} from '@/components/projects/project-form'
import { describeDuration, readTemplateContent, summarizeTemplate } from '@/lib/project-templates'

async function getClientMailingAddresses(organizationId: string): Promise<Record<string, ClientMailingAddress>> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('clients')
    .select('id, address_line1, address_line2, city, state, postal_code')
    .eq('organization_id', organizationId)
  const addresses: Record<string, ClientMailingAddress> = {}
  for (const row of data ?? []) {
    if (!row.address_line1) continue
    addresses[row.id] = {
      address_line1: row.address_line1 ?? '',
      address_line2: row.address_line2 ?? '',
      city: row.city ?? '',
      state: row.state ?? '',
      postal_code: row.postal_code ?? '',
    }
  }
  return addresses
}

/** Published, active templates: the starter catalog plus this company's own. */
async function getTemplateOptions(organizationId: string): Promise<ProjectTemplateOption[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('project_templates')
    .select('organization_id, name, description, current_version_id, project_template_versions!project_templates_current_version_fkey(content)')
    .eq('status', 'published')
    .is('archived_at', null)
    .not('current_version_id', 'is', null)
    .or(`organization_id.is.null,organization_id.eq.${organizationId}`)
    .order('name')
  return (data ?? []).map((t) => {
    const version = t.project_template_versions as unknown as { content: unknown } | null
    const summary = summarizeTemplate(readTemplateContent(version?.content))
    return {
      versionId: t.current_version_id as string,
      name: t.name,
      description: t.description,
      isStarter: t.organization_id === null,
      summary: `${summary.phases} phases · ${summary.activities} activities · ${describeDuration(summary.estimatedBusinessDays)}`,
      phases: summary.phases,
      activities: summary.activities,
      milestones: summary.milestones,
      estimatedBusinessDays: summary.estimatedBusinessDays,
    }
  })
}

/** Counts for the company's standard schedule catalog, or null before it has been seeded. */
async function getStandardScheduleSummary(organizationId: string): Promise<StandardScheduleSummary | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('schedule_template_items')
    .select('phase, activity_type')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
  if (!data?.length) return null
  return {
    phases: new Set(data.map((i) => (i.phase ?? '').toLowerCase())).size,
    activities: data.length,
    milestones: data.filter((i) => i.activity_type === 'milestone').length,
  }
}

/** Everything the New Project form needs, shared by the full page and the drawer. */
export async function loadNewProjectFormData(organizationId: string, client?: string) {
  const [clientOptions, managers, features, clientAddresses, templates, standardSchedule] = await Promise.all([
    getClientOptions(organizationId),
    getStaffMembers(organizationId, ['org_admin', 'project_manager']),
    getOrgFeatures(organizationId),
    getClientMailingAddresses(organizationId),
    getTemplateOptions(organizationId),
    getStandardScheduleSummary(organizationId),
  ])
  return {
    clientOptions,
    clientAddresses,
    scheduleSetup: features.schedule,
    templates: features.schedule ? templates : [],
    standardSchedule: features.schedule ? standardSchedule : null,
    managerOptions: managers.map((m) => ({ value: m.user_id, label: m.full_name || m.email || 'Team member' })),
    preselected: clientOptions.some((o) => o.value === client) ? client : undefined,
  }
}
