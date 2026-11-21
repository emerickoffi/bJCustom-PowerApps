'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin, requireManager } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { toTemplatePayload, validateWarrantyTemplate, type WarrantyTemplateInput } from '@/lib/warranty-templates'

export type WarrantyActionResult = { ok: true; id?: string; message: string } | { ok: false; error: string }

const uuid = z.string().uuid()

/** Our RPCs raise messages written for builders; anything else gets a generic line. */
function rpcError(error: { code?: string; message?: string }): string {
  if (error.code === 'PGRST202' || error.code === '42883') return 'Custom warranties need a database update before they can be saved.'
  if (['22023', 'P0002', '42501'].includes(error.code ?? '') && error.message) return error.message
  return 'The warranty could not be saved. Try again.'
}

async function requireWarrantyAdmin() {
  const session = await requireAdmin()
  const features = await getOrgFeatures(session.organizationId)
  if (!features.warranty) return null
  return session
}

const refresh = () => {
  revalidatePath('/settings/warranty')
  revalidatePath('/warranty')
}

export async function saveWarrantyTemplateAction(templateId: string | null, input: WarrantyTemplateInput): Promise<WarrantyActionResult> {
  const session = await requireWarrantyAdmin()
  if (!session) return { ok: false, error: 'Turn on Warranty Management first.' }
  if (templateId && !uuid.safeParse(templateId).success) return { ok: false, error: 'Warranty not found.' }
  const checked = validateWarrantyTemplate(input)
  if (!checked.ok) return checked
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('save_warranty_template', {
    p_org: session.organizationId,
    p_template: templateId,
    p_payload: toTemplatePayload(checked.value),
  })
  if (error) return { ok: false, error: rpcError(error) }
  refresh()
  return { ok: true, id: data as string, message: templateId ? 'Warranty saved. New homes will use these terms.' : 'Warranty created.' }
}

export async function setDefaultWarrantyTemplateAction(templateId: string): Promise<WarrantyActionResult> {
  if (!(await requireWarrantyAdmin())) return { ok: false, error: 'Turn on Warranty Management first.' }
  if (!uuid.safeParse(templateId).success) return { ok: false, error: 'Warranty not found.' }
  const { error } = await (await createClient()).rpc('set_default_warranty_template', { p_template: templateId })
  if (error) return { ok: false, error: rpcError(error) }
  refresh()
  return { ok: true, message: 'Default warranty updated.' }
}

export async function deleteWarrantyTemplateAction(templateId: string): Promise<WarrantyActionResult> {
  if (!(await requireWarrantyAdmin())) return { ok: false, error: 'Turn on Warranty Management first.' }
  if (!uuid.safeParse(templateId).success) return { ok: false, error: 'Warranty not found.' }
  const { error } = await (await createClient()).rpc('delete_warranty_template', { p_template: templateId })
  if (error) return { ok: false, error: rpcError(error) }
  refresh()
  return { ok: true, message: 'Warranty deleted.' }
}

/** Which warranty a project gets when it completes (null = company default). */
export async function setProjectWarrantyTemplateAction(projectId: string, templateId: string | null): Promise<WarrantyActionResult> {
  await requireManager()
  if (!uuid.safeParse(projectId).success || (templateId && !uuid.safeParse(templateId).success)) {
    return { ok: false, error: 'Warranty not found.' }
  }
  const { error } = await (await createClient()).rpc('set_project_warranty_template', { p_project: projectId, p_template: templateId })
  if (error) return { ok: false, error: rpcError(error) }
  revalidatePath(`/projects/${projectId}/warranty`)
  return { ok: true, message: 'This home will get the selected warranty when it is completed.' }
}
