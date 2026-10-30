import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { getClientOptions, getStaffMembers } from '@/lib/queries'
import { getOrgFeatures } from '@/lib/features'
import type { ClientMailingAddress } from '@/components/projects/project-form'

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

/** Everything the New Project form needs, shared by the full page and the drawer. */
export async function loadNewProjectFormData(organizationId: string, client?: string) {
  const [clientOptions, managers, features, clientAddresses] = await Promise.all([
    getClientOptions(organizationId),
    getStaffMembers(organizationId, ['org_admin', 'project_manager']),
    getOrgFeatures(organizationId),
    getClientMailingAddresses(organizationId),
  ])
  return {
    clientOptions,
    clientAddresses,
    scheduleSetup: features.schedule,
    managerOptions: managers.map((m) => ({ value: m.user_id, label: m.full_name || m.email || 'Team member' })),
    preselected: clientOptions.some((o) => o.value === client) ? client : undefined,
  }
}
