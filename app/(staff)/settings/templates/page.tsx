import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { LayoutTemplate } from 'lucide-react'
import { requireAdmin } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { createClient } from '@/lib/supabase/server'
import { HeaderHelp, PageHeader, pageLayout } from '@/components/shared/page-header'
import { TemplateLibrary, type TemplateListItem } from '@/components/templates/template-library'
import { readTemplateContent, summarizeTemplate } from '@/lib/project-templates'

export const metadata: Metadata = { title: 'Project templates' }

export default async function ProjectTemplatesPage() {
  const session = await requireAdmin()
  const features = await getOrgFeatures(session.organizationId)
  if (!features.schedule) redirect('/settings')

  const supabase = await createClient()
  const [{ data, error }, projectsRes] = await Promise.all([
    supabase
      .from('project_templates')
      .select('id, organization_id, starter_key, name, description, status, draft, current_version_id, archived_at, updated_at, project_template_versions!project_template_versions_template_id_fkey(id, version, content)')
      .order('name'),
    supabase
      .from('projects')
      .select('id, name, schedule_activities!inner(id)')
      .eq('organization_id', session.organizationId)
      .limit(1, { referencedTable: 'schedule_activities' })
      .order('updated_at', { ascending: false })
      .limit(100),
  ])
  const projects = (projectsRes.data ?? []).map((p) => ({ id: p.id as string, name: p.name as string }))

  const items: TemplateListItem[] = (data ?? []).map((t) => {
    const versions = (t.project_template_versions ?? []) as { id: string; version: number; content: unknown }[]
    const current = versions.find((v) => v.id === t.current_version_id) ?? null
    const isStarter = t.organization_id === null
    const content = readTemplateContent(isStarter && current ? current.content : t.draft)
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      isStarter,
      status: t.status as 'draft' | 'published',
      archived: t.archived_at !== null,
      version: current?.version ?? null,
      updatedAt: t.updated_at,
      summary: summarizeTemplate(content),
    }
  })

  return (
    <div className={pageLayout('workspace')}>
      <PageHeader
        icon={LayoutTemplate}
        title="Project templates"
        level={2}
        titleAddon={
          <HeaderHelp label="About project templates">
            Templates set up a new project&apos;s schedule phases, activities, durations, and dependencies. Editing a
            template never changes projects already created from it. Only published versions can be used.
          </HeaderHelp>
        }
      />
      {error ? (
        <p role="alert" className="rounded-xl border border-border bg-white p-4 text-sm text-destructive">
          Templates could not be loaded. Refresh the page to try again.
        </p>
      ) : (
        <TemplateLibrary items={items} projects={projects} />
      )}
    </div>
  )
}
