'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireStaff } from '@/lib/session'
import { setupDismissCookie } from '@/lib/project-setup'

const projectId = z.string().uuid()

/** Dismissal is a per-browser view preference; it never changes project records or other projects. */
export async function setSetupChecklistDismissed(formData: FormData) {
  await requireStaff()
  const id = projectId.safeParse(formData.get('projectId'))
  if (!id.success) return
  const dismissed = formData.get('dismissed') === 'true'
  const jar = await cookies()
  const name = setupDismissCookie(id.data)
  if (dismissed) {
    jar.set(name, '1', { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax', httpOnly: true, secure: true })
  } else {
    jar.delete(name)
  }
  revalidatePath(`/projects/${id.data}`)
}
