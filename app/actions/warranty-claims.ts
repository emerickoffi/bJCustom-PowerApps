'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'
import { friendlyDbError, fromZodError, formValues, type ActionState } from '@/lib/action-state'

const MAX_FILES = 6
const MAX_BYTES = 15 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])

type MediaKind = 'original' | 'info' | 'repair'

function collectFiles(formData: FormData): File[] | string {
  const files = formData.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0)
  if (files.length > MAX_FILES) return `Attach up to ${MAX_FILES} files at a time.`
  for (const f of files) {
    if (!ALLOWED_TYPES.has(f.type)) return `${f.name} is not a supported file type (JPG, PNG, WebP, HEIC or PDF).`
    if (f.size > MAX_BYTES) return `${f.name} is larger than 15 MB.`
  }
  return files
}

async function uploadClaimFiles(claimId: string, files: File[], kind: MediaKind): Promise<string | null> {
  if (files.length === 0) return null
  const supabase = await createClient()
  const { data: claim } = await supabase
    .from('warranty_claims')
    .select('organization_id, project_id')
    .eq('id', claimId)
    .maybeSingle()
  if (!claim) return 'Claim not found.'
  for (const file of files) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80) || 'file'
    const path = `${claim.organization_id}/${claim.project_id}/${claimId}/${crypto.randomUUID()}-${safeName}`
    const { error: uploadError } = await supabase.storage
      .from('warranty-claims')
      .upload(path, file, { contentType: file.type, upsert: false })
    if (uploadError) return `Could not upload ${file.name}.`
    const { error: rowError } = await supabase.from('warranty_claim_media').insert({
      claim_id: claimId,
      organization_id: claim.organization_id,
      project_id: claim.project_id,
      storage_path: path,
      kind,
      file_name: file.name.slice(0, 200),
      content_type: file.type,
      size_bytes: file.size,
    })
    if (rowError) return friendlyDbError(rowError)
  }
  return null
}

function revalidateClaimPaths(projectId: string) {
  revalidatePath(`/projects/${projectId}/warranty`)
  revalidatePath(`/portal/projects/${projectId}/warranty`)
  revalidatePath('/warranty')
}

const submitSchema = z.object({
  project_id: z.uuid(),
  coverage_key: z.string().min(1, 'Choose a coverage period'),
  category: z.string().min(1, 'Choose a category'),
  location: z.string().trim().min(2, 'Enter where the item is located').max(200),
  title: z.string().trim().min(3, 'Enter a short title').max(160),
  description: z.string().trim().min(10, 'Describe the item in at least 10 characters').max(5000),
})

export async function submitClaimAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getSession()
  if (!session) return { error: 'Sign in required.' }
  const values = formValues(formData)
  const parsed = submitSchema.safeParse(values)
  if (!parsed.success) return { ...fromZodError(parsed.error), values }
  const files = collectFiles(formData)
  if (typeof files === 'string') return { error: files, values }

  const supabase = await createClient()
  const d = parsed.data
  const { data: claimId, error } = await supabase.rpc('submit_warranty_claim', {
    p_project: d.project_id,
    p_coverage_key: d.coverage_key,
    p_category: d.category,
    p_location: d.location,
    p_title: d.title,
    p_description: d.description,
  })
  if (error || !claimId) return { error: friendlyDbError(error), values }

  const uploadError = await uploadClaimFiles(claimId as string, files, 'original')
  revalidateClaimPaths(d.project_id)
  if (uploadError) return { error: `Claim submitted, but ${uploadError}` }
  return { success: 'Claim submitted. Your builder has been notified.' }
}

const STAFF_ACTIONS = [
  'start_review',
  'request_info',
  'accept',
  'not_covered',
  'start_work',
  'ready_for_validation',
  'close',
  'assign',
  'note',
  'update_corrective',
] as const

const staffSchema = z.object({
  claim_id: z.uuid(),
  project_id: z.uuid(),
  action: z.enum(STAFF_ACTIONS),
  note: z.string().max(2000).optional(),
  assignee: z.union([z.uuid(), z.literal('')]).optional(),
  corrective: z.string().max(5000).optional(),
})

export async function staffClaimAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getSession()
  if (!session || !session.role || session.role === 'client') return { error: 'Staff access required.' }
  const parsed = staffSchema.safeParse(formValues(formData))
  if (!parsed.success) return fromZodError(parsed.error)
  const files = collectFiles(formData)
  if (typeof files === 'string') return { error: files }

  const d = parsed.data
  const supabase = await createClient()
  const { error } = await supabase.rpc('staff_warranty_claim_action', {
    p_claim: d.claim_id,
    p_action: d.action,
    p_note: d.note || null,
    p_assignee: d.assignee || null,
    p_corrective: d.corrective || null,
  })
  if (error) return { error: friendlyDbError(error) }
  const uploadError = await uploadClaimFiles(d.claim_id, files, 'repair')
  revalidateClaimPaths(d.project_id)
  if (uploadError) return { error: `Saved, but ${uploadError}` }
  return { success: 'Claim updated.' }
}

const homeownerSchema = z.object({
  claim_id: z.uuid(),
  project_id: z.uuid(),
  action: z.enum(['provide_info', 'accept_repair', 'reject_repair']),
  note: z.string().max(2000).optional(),
})

export async function homeownerClaimAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getSession()
  if (!session || session.role !== 'client') return { error: 'Homeowner access required.' }
  const parsed = homeownerSchema.safeParse(formValues(formData))
  if (!parsed.success) return fromZodError(parsed.error)
  const files = collectFiles(formData)
  if (typeof files === 'string') return { error: files }

  const d = parsed.data
  const supabase = await createClient()
  const { error } = await supabase.rpc('homeowner_warranty_claim_action', {
    p_claim: d.claim_id,
    p_action: d.action,
    p_note: d.note || null,
  })
  if (error) return { error: friendlyDbError(error) }
  const uploadError = d.action === 'provide_info' ? await uploadClaimFiles(d.claim_id, files, 'info') : null
  revalidateClaimPaths(d.project_id)
  if (uploadError) return { error: `Saved, but ${uploadError}` }
  return {
    success:
      d.action === 'accept_repair'
        ? 'Thank you. Your builder will close this claim.'
        : d.action === 'reject_repair'
          ? 'Sent back to your builder for more work.'
          : 'Information sent to your builder.',
  }
}
