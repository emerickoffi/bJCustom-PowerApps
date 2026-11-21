import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type WarrantyCoverageRecord = {
  coverage_key: string
  name: string
  duration_months: number
  categories: string[]
  description: string | null
  exclusions: string | null
  sort_order: number
}

export type WarrantyTemplateRecord = {
  id: string
  name: string
  description: string | null
  disclaimer: string
  reminder_days: number[]
  is_default: boolean
  updated_at: string
  coverages: WarrantyCoverageRecord[]
  /** Projects set to use this warranty when they complete. */
  plannedProjects: number
  /** Homes whose warranty started from this template (their terms are saved and never change). */
  activeHomes: number
}

/** The company's warranties, default first. Creates the starter 1-2-10 warranty if the company has none yet. */
export async function getWarrantyTemplates(organizationId: string): Promise<{ templates: WarrantyTemplateRecord[]; editable: boolean }> {
  const supabase = await createClient()
  const load = () =>
    supabase
      .from('warranty_templates')
      .select('id, name, description, disclaimer, reminder_days, is_default, updated_at, warranty_coverage_rules(coverage_key, name, duration_months, categories, description, exclusions, sort_order)')
      .eq('organization_id', organizationId)
      .order('is_default', { ascending: false })
      .order('name')
  let { data } = await load()
  if (!data?.length) {
    await createAdminClient().rpc('ensure_default_warranty_template', { p_org: organizationId })
    data = (await load()).data
  }

  const [{ data: planned, error: plannedError }, { data: active }] = await Promise.all([
    supabase.from('projects').select('warranty_template_id').eq('organization_id', organizationId).not('warranty_template_id', 'is', null),
    supabase.from('project_warranties').select('template_id').eq('organization_id', organizationId),
  ])
  const count = (rows: { [k: string]: unknown }[] | null, key: string, id: string) => (rows ?? []).filter((r) => r[key] === id).length

  const templates = (data ?? []).map((t) => ({
    id: t.id as string,
    name: t.name as string,
    description: t.description as string | null,
    disclaimer: t.disclaimer as string,
    reminder_days: (t.reminder_days as number[]) ?? [],
    is_default: Boolean(t.is_default),
    updated_at: t.updated_at as string,
    coverages: ((t.warranty_coverage_rules ?? []) as WarrantyCoverageRecord[]).slice().sort((a, b) => a.sort_order - b.sort_order),
    plannedProjects: count(planned, 'warranty_template_id', t.id as string),
    activeHomes: count(active, 'template_id', t.id as string),
  }))
  // projects.warranty_template_id only exists once the custom-warranties database update is applied.
  return { templates, editable: !plannedError }
}

/** Options for a project's warranty picker. */
export async function getWarrantyTemplateOptions(organizationId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('warranty_templates')
    .select('id, name, is_default')
    .eq('organization_id', organizationId)
    .order('is_default', { ascending: false })
    .order('name')
  return (data ?? []) as { id: string; name: string; is_default: boolean }[]
}
