import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { ApprovalDetail, ApprovalDocumentType, ApprovalListItem } from '@/lib/portal-approvals'

/** Every estimate and change order shared with the signed-in homeowner, scoped by the database. */
export async function getPortalApprovals(): Promise<ApprovalListItem[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('portal_approval_items')
  if (error) {
    console.error('portal_approval_items failed', error.message)
    return []
  }
  return (data ?? []) as ApprovalListItem[]
}

export async function getPortalApprovalDetail(type: ApprovalDocumentType, id: string): Promise<ApprovalDetail | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('portal_approval_detail', { p_type: type, p_id: id })
  if (error) {
    console.error('portal_approval_detail failed', error.message)
    return null
  }
  return (data ?? null) as ApprovalDetail | null
}
