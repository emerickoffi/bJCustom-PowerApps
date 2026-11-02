'use server'

import { requireStaff } from '@/lib/session'
import { getAuthorizedJob, searchAuthorizedJobs, type JobSummary } from '@/lib/job-context'
import { isProjectId } from '@/lib/route-job'

export async function searchJobsAction(query: string): Promise<JobSummary[]> {
  const session = await requireStaff()
  return searchAuthorizedJobs(session.organizationId, typeof query === 'string' ? query : '')
}

/** Resolves the project named in the current URL, verified under RLS. Null when invalid or inaccessible. */
export async function getJobAction(projectId: string): Promise<JobSummary | null> {
  const session = await requireStaff()
  if (!isProjectId(projectId)) return null
  return getAuthorizedJob(session.organizationId, projectId, { includeArchived: true })
}
