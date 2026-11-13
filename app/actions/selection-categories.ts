'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { canManage, requireAdmin, requireStaff } from '@/lib/session'
import { requireFeature } from '@/lib/features'
import { friendlyDbError } from '@/lib/action-state'
import { getSelectionCategoryRecords } from '@/lib/selections-data'
import { checkCategoryName } from '@/lib/selection-option-lists'

export type CategoryActionResult = { ok: true; name: string } | { ok: false; error: string }

const SETTINGS_PATH = '/settings/selection-categories'

function revalidateCategories() {
  revalidatePath(SETTINGS_PATH)
  revalidatePath('/projects/[id]/selections', 'page')
  revalidatePath('/projects/[id]/selections/[selectionId]', 'page')
}

/**
 * Adds a company-wide category from the selection forms. Managers only (matches the
 * selection_categories insert policy); an existing name is returned instead of duplicated.
 */
export async function createSelectionCategoryAction(rawName: string): Promise<CategoryActionResult> {
  const session = await requireStaff()
  if (!canManage(session.role)) return { ok: false, error: 'Only admins and project managers can add categories.' }
  await requireFeature(session.organizationId, 'estimates')
  if (typeof rawName !== 'string') return { ok: false, error: 'Enter a category name.' }

  const { records } = await getSelectionCategoryRecords()
  const check = checkCategoryName(rawName, records)
  if (!check.ok) return check
  if (check.existing) return { ok: true, name: check.existing.name }

  const supabase = await createClient()
  const { error } = await supabase.from('selection_categories').insert({ organization_id: session.organizationId, name: check.name })
  if (error?.code === '23505') {
    // Lost a race with another user creating the same name; select theirs.
    const again = checkCategoryName(check.name, (await getSelectionCategoryRecords()).records)
    return again.ok && again.existing ? { ok: true, name: again.existing.name } : { ok: false, error: friendlyDbError(error) }
  }
  if (error) return { ok: false, error: friendlyDbError(error) }
  revalidateCategories()
  return { ok: true, name: check.name }
}

const idSchema = z.uuid()

async function requireCategoryAdmin() {
  const session = await requireAdmin()
  await requireFeature(session.organizationId, 'estimates')
  return session
}

export async function renameSelectionCategoryAction(id: string, rawName: string): Promise<CategoryActionResult> {
  const session = await requireCategoryAdmin()
  if (!idSchema.safeParse(id).success || typeof rawName !== 'string') return { ok: false, error: 'Category not found.' }
  const { records, manageable } = await getSelectionCategoryRecords()
  if (!manageable) return { ok: false, error: 'Category management is not enabled yet for this company.' }
  const current = records.find((r) => r.id === id)
  if (!current) return { ok: false, error: 'Category not found.' }

  const check = checkCategoryName(rawName, records, id)
  if (!check.ok) return check
  if (check.existing) return { ok: false, error: `“${check.existing.name}” already exists.` }
  if (check.name === current.name) return { ok: true, name: current.name }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('selection_categories')
    .update({ name: check.name })
    .eq('id', id)
    .eq('organization_id', session.organizationId)
    .select('id')
  if (error) return { ok: false, error: friendlyDbError(error) }
  if (!data?.length) return { ok: false, error: 'You do not have permission to perform this action.' }
  revalidateCategories()
  return { ok: true, name: check.name }
}

export async function setSelectionCategoryActiveAction(id: string, active: boolean): Promise<CategoryActionResult> {
  const session = await requireCategoryAdmin()
  if (!idSchema.safeParse(id).success) return { ok: false, error: 'Category not found.' }
  const { records, manageable } = await getSelectionCategoryRecords()
  if (!manageable) return { ok: false, error: 'Category management is not enabled yet for this company.' }
  const current = records.find((r) => r.id === id)
  if (!current) return { ok: false, error: 'Category not found.' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('selection_categories')
    .update({ archived_at: active ? null : new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', session.organizationId)
    .select('id')
  if (error) return { ok: false, error: friendlyDbError(error) }
  if (!data?.length) return { ok: false, error: 'You do not have permission to perform this action.' }
  revalidateCategories()
  return { ok: true, name: current.name }
}
