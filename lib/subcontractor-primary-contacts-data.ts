import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { personName } from '@/lib/contacts'
import type { PrimaryContact } from '@/lib/subcontractor-directory'

type LinkRow = { id: string; subcontractor_company_id: string }
type PrimaryRow = {
  company_id: string
  position_or_role: string | null
  person: { first_name: string; last_name: string; email: string | null; primary_phone: string | null; status: string } | null
}

/**
 * Each subcontractor's active primary contact person, keyed by subcontractor company id, using the same relationship
 * and ordering as the preview panel. Null when either lookup fails so the table never shows a false "Not provided".
 */
export async function loadPrimaryContacts(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<Record<string, PrimaryContact> | null> {
  const links = await supabase
    .from('business_companies')
    .select('id, subcontractor_company_id')
    .eq('organization_id', organizationId)
    .not('subcontractor_company_id', 'is', null)
    .limit(5000)
  if (links.error) return null
  const subcontractorByCompany = new Map(((links.data ?? []) as LinkRow[]).map((l) => [l.id, l.subcontractor_company_id]))
  if (!subcontractorByCompany.size) return {}

  const primaries = await supabase
    .from('business_person_companies')
    .select('company_id, position_or_role, person:business_people(first_name, last_name, email, primary_phone, status)')
    .eq('organization_id', organizationId)
    .eq('is_primary_contact', true)
    .eq('status', 'active')
    .order('started_at', { ascending: false })
    .order('id')
    .limit(5000)
  if (primaries.error) return null

  const result: Record<string, PrimaryContact> = {}
  for (const row of (primaries.data ?? []) as unknown as PrimaryRow[]) {
    const subcontractorId = subcontractorByCompany.get(row.company_id)
    if (!subcontractorId || result[subcontractorId] || row.person?.status !== 'active') continue
    result[subcontractorId] = {
      name: personName(row.person),
      role: row.position_or_role,
      email: row.person.email,
      phone: row.person.primary_phone,
    }
  }
  return result
}
