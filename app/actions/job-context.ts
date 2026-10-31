'use server'

import { cookies } from 'next/headers'
import { requireStaff } from '@/lib/session'
import {
  CURRENT_JOB_COOKIE,
  decodeJobCookie,
  encodeJobCookie,
  getAuthorizedJob,
  searchAuthorizedJobs,
  type JobSummary,
} from '@/lib/job-context'

export async function searchJobsAction(query: string): Promise<JobSummary[]> {
  const session = await requireStaff()
  return searchAuthorizedJobs(session.organizationId, typeof query === 'string' ? query : '')
}

/** Sets or clears the current job. The id is verified under RLS before it is remembered. */
export async function setCurrentJobAction(projectId: string | null): Promise<{ ok: boolean }> {
  const session = await requireStaff()
  const store = await cookies()
  if (!projectId) {
    store.delete(CURRENT_JOB_COOKIE)
    return { ok: true }
  }
  if (decodeJobCookie(store.get(CURRENT_JOB_COOKIE)?.value, session.organizationId) === projectId) return { ok: true }
  const job = await getAuthorizedJob(session.organizationId, projectId)
  if (!job) {
    store.delete(CURRENT_JOB_COOKIE)
    return { ok: false }
  }
  store.set(CURRENT_JOB_COOKIE, encodeJobCookie(session.organizationId, job.id), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 180,
  })
  return { ok: true }
}
