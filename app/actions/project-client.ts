'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireManager } from '@/lib/session'
import type { ActionState } from '@/lib/action-state'
import { assignPrimaryClient } from '@/lib/project-client-assignment'

const uuid = z.uuid()
const optionalUuid = uuid.nullable()

/** Assigns, changes, or removes (clientId: null) a saved project's primary homeowner. */
export async function assignProjectClientAction(
  projectId: string,
  clientId: string | null,
  expectedClientId: string | null,
): Promise<ActionState> {
  const session = await requireManager()
  if (!uuid.safeParse(projectId).success) return { error: 'Invalid project.' }
  if (!optionalUuid.safeParse(clientId).success || !optionalUuid.safeParse(expectedClientId).success) {
    return { error: 'Invalid client.' }
  }

  const supabase = await createClient()
  const result = await assignPrimaryClient(supabase, {
    organizationId: session.organizationId,
    userId: session.userId,
    projectId,
    clientId,
    expectedClientId,
  })
  if (!result.ok) {
    if (result.conflict) revalidatePath(`/projects/${projectId}`)
    return { error: result.error }
  }

  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/projects')
  revalidatePath('/clients')
  for (const id of [clientId, expectedClientId]) if (id) revalidatePath(`/clients/${id}`)
  revalidatePath('/dashboard')
  return {
    success: clientId ? 'Primary homeowner saved.' : 'Primary homeowner removed. The client record was not deleted.',
  }
}
