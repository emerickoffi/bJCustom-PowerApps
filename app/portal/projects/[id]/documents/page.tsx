import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { FolderOpen } from 'lucide-react'
import { getSession } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { createClient } from '@/lib/supabase/server'
import { PageHeader, EmptyState } from '@/components/shared/page-header'
import { DocumentLibrary } from '@/components/documents/document-library'
import { CategoryNav, DocumentFiltersForm, DocumentPagination, type BrowseParams } from '@/components/documents/document-browse'
import { getCategoryCounts, listDocuments } from '@/lib/document-queries'
import { getMySignatureTasks } from '@/app/actions/signatures'
import { PortalSignatureTasks } from '@/components/signatures/portal-signature-tasks'

export const metadata: Metadata = { title: 'Project documents' }

export default async function PortalDocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<BrowseParams>
}) {
  const session = await getSession()
  if (!session?.organizationId || session.role !== 'client') redirect('/portal')
  const features = await getOrgFeatures(session.organizationId)
  if (!features.documents) redirect('/portal')
  const { id } = await params
  const sp = await searchParams
  const supabase = await createClient()

  const { data: homeowner } = await supabase.rpc('is_project_homeowner', { p_project: id })
  if (!homeowner) notFound()
  const { data: project } = await supabase.from('projects').select('id, name').eq('id', id).maybeSingle()
  if (!project) notFound()

  const view = { q: sp.q, category: sp.category, page: sp.page }
  const base = `/portal/projects/${id}/documents`
  const [list, counts, tasks] = await Promise.all([
    listDocuments({ projectId: id, q: sp.q, category: sp.category, page: Number(sp.page) || 1 }, { sharedOnly: true }),
    getCategoryCounts(id, true),
    features.e_signatures ? getMySignatureTasks(id) : Promise.resolve([]),
  ])
  const filtered = Boolean(sp.q || sp.category)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={FolderOpen}
        backHref="/portal"
        backLabel="My home"
        title="Documents"
        description={`Documents your builder has shared for ${project.name}.`}
      />
      <PortalSignatureTasks tasks={tasks} />
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {counts && (
          <aside className="lg:w-64 lg:shrink-0">
            <CategoryNav base={base} params={view} counts={counts} />
          </aside>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <DocumentFiltersForm params={view} showVisibility={false} showArchived={false} />
          {!list.ok ? (
            <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{list.error}</p>
          ) : list.rows.length === 0 ? (
            <EmptyState
              icon={FolderOpen}
              title={filtered ? 'No matching documents' : 'No documents shared yet'}
              description={filtered ? 'Try a different search or category.' : 'When your builder shares plans, permits, or reports, they will appear here.'}
            />
          ) : (
            <>
              <DocumentLibrary rows={list.rows} mode="portal" canEdit={false} canManage={false} people={{}} />
              <DocumentPagination base={base} params={view} page={list.page} pageCount={list.pageCount} total={list.total} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
