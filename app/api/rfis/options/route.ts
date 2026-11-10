import { NextResponse } from 'next/server'
import { z } from 'zod'
import { canManage, getSession } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { createClient } from '@/lib/supabase/server'
import { isRfiSetupError, rfiDbError, type RfiDocumentOption, type RfiProjectOption, type RfiResponderOption } from '@/lib/rfis'

const NO_STORE = { 'Cache-Control': 'private, no-store' }
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })

/**
 * Choices for the "Ask a question" drawer.
 * Without `project`: the projects this person may ask on (nothing is preselected).
 * With `project`: who can answer on that project, who cannot yet and why, and the documents that can be referenced.
 */
export async function GET(request: Request) {
  const session = await getSession()
  if (!session) return json({ error: 'Sign in to continue.' }, 401)
  if (!session.organizationId || session.activationRequired || !session.role || session.role === 'client') {
    return json({ error: 'You do not have permission to ask questions.' }, 403)
  }
  const features = await getOrgFeatures(session.organizationId)
  if (!features.rfis) return json({ error: 'Questions (RFIs) are turned off for this company.' }, 403)

  const supabase = await createClient()
  const manager = canManage(session.role)
  const projectId = new URL(request.url).searchParams.get('project')

  if (!projectId) {
    // Same rule as can_view_project_internal: managers reach every project, builder staff only their own.
    let ownIds: string[] | null = null
    if (!manager) {
      const { data: memberships, error } = await supabase.from('project_members').select('project_id').eq('user_id', session.userId)
      if (error) return json({ error: 'Projects could not be loaded.' }, 500)
      ownIds = (memberships ?? []).map((m) => m.project_id as string)
    }
    let query = supabase
      .from('projects')
      .select('id, name, project_number')
      .eq('organization_id', session.organizationId)
      .is('archived_at', null)
      .order('name', { ascending: true })
      .limit(500)
    if (ownIds) {
      query = ownIds.length
        ? query.or(`project_manager_id.eq.${session.userId},id.in.(${ownIds.join(',')})`)
        : query.eq('project_manager_id', session.userId)
    }
    const { data, error } = await query
    if (error) return json({ error: 'Projects could not be loaded.' }, 500)
    return json({ projects: (data ?? []) as RfiProjectOption[] })
  }

  if (!z.uuid().safeParse(projectId).success) return json({ error: 'Choose a project.' }, 400)
  const [project, responders, documents] = await Promise.all([
    supabase.from('projects').select('id, name, organization_id').eq('id', projectId).eq('organization_id', session.organizationId).maybeSingle(),
    supabase.rpc('rfi_responder_options', { p_project: projectId }),
    features.documents
      ? supabase
          .from('project_documents')
          .select('name, current_version_id, current_version_number')
          .eq('project_id', projectId)
          .eq('scope', 'project')
          .is('archived_at', null)
          .not('current_version_id', 'is', null)
          .order('name', { ascending: true })
          .limit(300)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (!project.data) return json({ error: 'You do not have access to this project.' }, 404)
  if (responders.error) {
    return json({ error: rfiDbError(responders.error) }, isRfiSetupError(responders.error) ? 503 : 403)
  }

  const documentOptions: RfiDocumentOption[] = ((documents.data ?? []) as {
    name: string
    current_version_id: string
    current_version_number: number
  }[]).map((d) => ({ versionId: d.current_version_id, label: `${d.name} (v${d.current_version_number})` }))

  return json({
    project: project.data,
    responders: ((responders.data ?? []) as RfiResponderOption[]).sort(
      (a, b) => Number(b.eligible) - Number(a.eligible) || a.full_name.localeCompare(b.full_name),
    ),
    documents: documentOptions,
    manager,
  })
}
