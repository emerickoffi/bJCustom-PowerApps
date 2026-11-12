'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { friendlyDbError } from '@/lib/action-state'
import {
  emptyTemplateContent,
  projectScheduleToTemplate,
  publishBlockers,
  readTemplateContent,
  validateTemplateContent,
} from '@/lib/project-templates'

const uuid = z.uuid()
const LIST_PATH = '/settings/templates'

export type TemplateActionResult = { ok: true; updatedAt?: string } | { ok: false; error: string; errors?: string[] }

const metaSchema = z.object({
  name: z.string().trim().min(2, 'Enter a name of at least 2 characters').max(120, 'Names are limited to 120 characters'),
  description: z.string().trim().max(1000, 'Descriptions are limited to 1,000 characters').optional().default(''),
  project_type: z.string().trim().max(40).optional().default(''),
})

async function requireTemplateAdmin() {
  const session = await requireAdmin()
  const features = await getOrgFeatures(session.organizationId)
  if (!features.schedule) redirect('/settings')
  return session
}

export async function createTemplateAction(formData: FormData): Promise<TemplateActionResult> {
  const session = await requireTemplateAdmin()
  const parsed = metaSchema.safeParse({
    name: formData.get('name') ?? '',
    description: formData.get('description') ?? '',
  })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the template name' }
  const sourceProjectId = String(formData.get('source_project_id') ?? '')
  if (sourceProjectId) {
    return createFromProject(session, sourceProjectId, parsed.data.name, parsed.data.description)
  }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('project_templates')
    .insert({
      organization_id: session.organizationId,
      name: parsed.data.name,
      description: parsed.data.description || null,
      draft: emptyTemplateContent(),
      created_by: session.userId,
      updated_by: session.userId,
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: friendlyDbError(error) }
  revalidatePath(LIST_PATH)
  redirect(`${LIST_PATH}/${data.id}`)
}

/**
 * Saves the draft only. Published versions are immutable, so projects already created from this
 * template are never affected. `expectedUpdatedAt` stops a stale tab from overwriting newer edits.
 */
export async function saveTemplateDraftAction(
  templateId: string,
  input: { name: string; description: string; project_type: string; content: unknown; expectedUpdatedAt: string },
): Promise<TemplateActionResult> {
  const session = await requireTemplateAdmin()
  if (!uuid.safeParse(templateId).success) return { ok: false, error: 'Template not found' }
  const meta = metaSchema.safeParse(input)
  if (!meta.success) return { ok: false, error: meta.error.issues[0]?.message ?? 'Check the template details' }
  const content = validateTemplateContent(input.content)
  if (!content.ok) return { ok: false, error: 'Fix the highlighted problems before saving.', errors: content.errors }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('project_templates')
    .update({
      name: meta.data.name,
      description: meta.data.description || null,
      project_type: meta.data.project_type || null,
      draft: content.content,
      updated_by: session.userId,
    })
    .eq('id', templateId)
    .eq('organization_id', session.organizationId)
    .eq('updated_at', input.expectedUpdatedAt)
    .select('updated_at')
    .maybeSingle()
  if (error) return { ok: false, error: friendlyDbError(error) }
  if (!data) {
    return { ok: false, error: 'This template was changed somewhere else. Reload the page to see the latest version before saving.' }
  }
  revalidatePath(LIST_PATH)
  revalidatePath(`${LIST_PATH}/${templateId}`)
  return { ok: true, updatedAt: data.updated_at }
}

export async function publishTemplateAction(templateId: string): Promise<TemplateActionResult> {
  const session = await requireTemplateAdmin()
  if (!uuid.safeParse(templateId).success) return { ok: false, error: 'Template not found' }
  const supabase = await createClient()
  const { data: tpl } = await supabase
    .from('project_templates')
    .select('draft')
    .eq('id', templateId)
    .eq('organization_id', session.organizationId)
    .maybeSingle()
  if (!tpl) return { ok: false, error: 'Template not found' }
  const blockers = publishBlockers(readTemplateContent(tpl.draft))
  if (blockers.length) return { ok: false, error: 'This template is not ready to publish.', errors: blockers }
  const { error } = await supabase.rpc('publish_project_template', { p_template: templateId })
  if (error) return { ok: false, error: friendlyDbError(error) }
  revalidatePath(LIST_PATH)
  revalidatePath(`${LIST_PATH}/${templateId}`)
  revalidatePath('/projects/new')
  return { ok: true }
}

export async function setTemplateArchivedAction(templateId: string, archived: boolean): Promise<TemplateActionResult> {
  const session = await requireTemplateAdmin()
  if (!uuid.safeParse(templateId).success) return { ok: false, error: 'Template not found' }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('project_templates')
    .update({ archived_at: archived ? new Date().toISOString() : null, updated_by: session.userId })
    .eq('id', templateId)
    .eq('organization_id', session.organizationId)
    .select('id')
    .maybeSingle()
  if (error) return { ok: false, error: friendlyDbError(error) }
  if (!data) return { ok: false, error: 'Template not found' }
  revalidatePath(LIST_PATH)
  revalidatePath(`${LIST_PATH}/${templateId}`)
  revalidatePath('/projects/new')
  return { ok: true }
}

/** Copies a starter or company template into a new company draft. The source is never changed. */
export async function duplicateTemplateAction(templateId: string): Promise<TemplateActionResult> {
  const session = await requireTemplateAdmin()
  if (!uuid.safeParse(templateId).success) return { ok: false, error: 'Template not found' }
  const supabase = await createClient()
  const { data: source } = await supabase
    .from('project_templates')
    .select('name, description, project_type, draft, organization_id, current_version_id')
    .eq('id', templateId)
    .maybeSingle()
  if (!source || (source.organization_id && source.organization_id !== session.organizationId)) {
    return { ok: false, error: 'Template not found' }
  }
  let content = source.draft
  if (!source.organization_id && source.current_version_id) {
    const { data: version } = await supabase
      .from('project_template_versions')
      .select('content')
      .eq('id', source.current_version_id)
      .maybeSingle()
    if (version) content = version.content
  }
  const name = `${source.name} (copy)`.slice(0, 120)
  const { data, error } = await supabase
    .from('project_templates')
    .insert({
      organization_id: session.organizationId,
      name,
      description: source.description,
      project_type: source.project_type,
      draft: readTemplateContent(content),
      created_by: session.userId,
      updated_by: session.userId,
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: friendlyDbError(error) }
  revalidatePath(LIST_PATH)
  redirect(`${LIST_PATH}/${data.id}`)
}

/**
 * Turns a project's schedule structure into a new draft template for review. Only names, types,
 * durations, weights, and dependencies are copied; nothing project-specific is.
 */
async function createFromProject(
  session: Awaited<ReturnType<typeof requireTemplateAdmin>>,
  projectId: string,
  name: string,
  description: string,
): Promise<TemplateActionResult> {
  if (!uuid.safeParse(projectId).success) return { ok: false, error: 'Project not found' }
  const supabase = await createClient()
  const { data: project } = await supabase
    .from('projects')
    .select('id, name, project_type')
    .eq('id', projectId)
    .eq('organization_id', session.organizationId)
    .maybeSingle()
  if (!project) return { ok: false, error: 'Project not found' }

  const [phasesRes, activitiesRes, depsRes] = await Promise.all([
    supabase.from('schedule_phases').select('id, name, sort_order').eq('project_id', projectId),
    supabase
      .from('schedule_activities')
      .select('id, name, phase_id, phase, activity_type, sort_order, weight, planned_start, planned_end, status')
      .eq('project_id', projectId),
    supabase.from('schedule_dependencies').select('predecessor_id, successor_id').eq('project_id', projectId),
  ])
  if (phasesRes.error || activitiesRes.error || depsRes.error) {
    return { ok: false, error: 'The project schedule could not be loaded. Try again.' }
  }
  const content = projectScheduleToTemplate({
    phases: phasesRes.data ?? [],
    activities: activitiesRes.data ?? [],
    dependencies: depsRes.data ?? [],
  })
  if (content.phases.length === 0) return { ok: false, error: 'This project has no schedule activities to save as a template.' }

  const { data, error } = await supabase
    .from('project_templates')
    .insert({
      organization_id: session.organizationId,
      name,
      description: description || `Created from ${project.name}. Review durations and dependencies before publishing.`.slice(0, 1000),
      project_type: project.project_type,
      draft: content,
      source_project_id: project.id,
      created_by: session.userId,
      updated_by: session.userId,
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: friendlyDbError(error) }
  revalidatePath(LIST_PATH)
  redirect(`${LIST_PATH}/${data.id}`)
}
