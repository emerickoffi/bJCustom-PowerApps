import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { z } from 'zod'
import { requireAdmin } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { createClient } from '@/lib/supabase/server'
import { pageLayout } from '@/components/shared/page-header'
import { TemplateEditor } from '@/components/templates/template-editor'
import { readTemplateContent } from '@/lib/project-templates'

export const metadata: Metadata = { title: 'Edit project template' }

export default async function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const session = await requireAdmin()
  const features = await getOrgFeatures(session.organizationId)
  if (!features.schedule) redirect('/settings')

  const supabase = await createClient()
  const { data: tpl } = await supabase
    .from('project_templates')
    .select('id, name, description, project_type, status, draft, archived_at, updated_at, current_version_id')
    .eq('id', id)
    .eq('organization_id', session.organizationId)
    .maybeSingle()
  if (!tpl) notFound()

  const [versionsRes, usageRes] = await Promise.all([
    supabase.from('project_template_versions').select('id, version, created_at').eq('template_id', id).order('version', { ascending: false }),
    supabase.from('projects').select('id', { count: 'exact', head: true }).eq('template_id', id),
  ])

  return (
    <div className={pageLayout('workspace')}>
      <TemplateEditor
        template={{
          id: tpl.id,
          name: tpl.name,
          description: tpl.description ?? '',
          projectType: tpl.project_type ?? '',
          status: tpl.status as 'draft' | 'published',
          archived: tpl.archived_at !== null,
          updatedAt: tpl.updated_at,
          content: readTemplateContent(tpl.draft),
        }}
        versions={(versionsRes.data ?? []).map((v) => ({ id: v.id, version: v.version, createdAt: v.created_at, current: v.id === tpl.current_version_id }))}
        projectsUsing={usageRes.count ?? 0}
      />
    </div>
  )
}
