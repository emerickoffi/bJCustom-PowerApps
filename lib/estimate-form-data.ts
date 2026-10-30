import type { createClient } from '@/lib/supabase/server'
import type { EstimateProjectOption } from '@/components/estimates/estimate-form'

type ClientRef = { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null

/** Active projects an estimate can be created for, shared by the full page and the drawer. */
export async function loadEstimateProjects(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
): Promise<EstimateProjectOption[]> {
  const { data } = await supabase
    .from('projects')
    .select('id, name, project_number, client:clients!projects_primary_client_id_fkey(first_name, last_name)')
    .eq('organization_id', organizationId)
    .not('status', 'eq', 'cancelled')
    .order('name')

  return (data ?? []).map((p) => {
    const c = Array.isArray(p.client) ? p.client[0] : (p.client as ClientRef)
    const client = Array.isArray(c) ? c[0] : c
    return {
      id: p.id,
      label: `${p.name} (${p.project_number})`,
      clientName: client ? `${client.first_name} ${client.last_name}` : null,
    }
  })
}
