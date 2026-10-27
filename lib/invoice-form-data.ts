import { createClient } from '@/lib/supabase/server'
import { listBillableEstimates } from '@/lib/invoice-queries'

export async function getInvoiceFormOptions(organizationId: string, excludeInvoiceId?: string) {
  const supabase = await createClient()
  const [{ data: projects }, estimates] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, project_number, primary_client_id')
      .eq('organization_id', organizationId)
      .not('status', 'eq', 'cancelled')
      .order('name'),
    listBillableEstimates(organizationId, excludeInvoiceId),
  ])
  return {
    projects: (projects ?? []).map((p) => ({
      id: p.id as string,
      name: p.name as string,
      project_number: (p.project_number as string | null) ?? null,
      has_client: Boolean(p.primary_client_id),
    })),
    estimates,
  }
}
