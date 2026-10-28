import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Archive, FolderOpen } from 'lucide-react'
import { canManage, requireStaff } from '@/lib/session'
import { requireFeature } from '@/lib/features'
import { createClient } from '@/lib/supabase/server'
import { PageHeader, EmptyState } from '@/components/shared/page-header'
import { DocumentLibrary } from '@/components/documents/document-library'
import { DocumentUploadButton } from '@/components/documents/document-upload-button'
import { CategoryNav, DocumentFiltersForm, DocumentPagination, browseHref, type BrowseParams } from '@/components/documents/document-browse'
import { countArchivedDocuments, getCategoryCounts, listDocuments } from '@/lib/document-queries'
import { getPeopleNames } from '@/lib/people'
import { isDocumentCategory } from '@/lib/documents'

export const metadata: Metadata = { title: 'Project documents' }

export default async function ProjectDocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<BrowseParams>
}) {
  const session = await requireStaff()
  const { id } = await params
  await requireFeature(session.organizationId, 'documents', `/projects/${id}`)
  const sp = await searchParams
  const supabase = await createClient()

  const [{ data: project }, { data: assigned }] = await Promise.all([
    supabase.from('projects').select('id, name, project_number, archived_at').eq('id', id).maybeSingle(),
    supabase.rpc('can_view_project_internal', { p_project: id }),
  ])
  if (!project || !assigned) notFound()

  const archived = sp.archived === '1'
  const base = `/projects/${id}/documents`
  const [list, counts, archivedCount] = await Promise.all([
    listDocuments({ projectId: id, q: sp.q, category: sp.category, visibility: sp.visibility, archived, page: Number(sp.page) || 1 }),
    getCategoryCounts(id),
    countArchivedDocuments(id),
  ])
  const people = list.ok ? await getPeopleNames(list.rows.map((r) => r.current_version?.uploaded_by)) : {}
  const manager = canManage(session.role)
  const filtered = Boolean(sp.q || sp.category || sp.visibility)
  const canUpload = !project.archived_at && !archived

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={FolderOpen}
        backHref={`/projects/${id}`}
        backLabel={project.name}
        eyebrow={project.project_number}
        title={archived ? 'Archived documents' : 'Project Documents'}
        description={
          archived
            ? 'Archived documents keep every version and can be restored.'
            : 'Manage plans, permits, reports, contracts, and project files.'
        }
        actions={canUpload ? <DocumentUploadButton projectId={id} canShare={manager} defaultCategory={isDocumentCategory(sp.category) ? sp.category : undefined} /> : null}
      />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {counts && !archived && (
          <aside className="lg:sticky lg:top-24 lg:w-64 lg:shrink-0">
            <CategoryNav base={base} params={sp} counts={counts} />
          </aside>
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <DocumentFiltersForm params={sp} showVisibility showArchived />
          <div className="flex justify-end">
            <Link
              href={browseHref(base, {}, archived ? {} : { archived: '1' })}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
            >
              <Archive className="size-4" aria-hidden="true" />
              {archived ? 'Back to active documents' : `Archived documents (${archivedCount})`}
            </Link>
          </div>

          {!list.ok ? (
            <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {list.error}
            </p>
          ) : list.rows.length === 0 ? (
            <EmptyState
              icon={FolderOpen}
              title={filtered ? 'No matching documents' : archived ? 'No archived documents' : 'No documents uploaded yet.'}
              description={
                filtered
                  ? 'Try a different search or category.'
                  : archived
                    ? 'Documents you archive appear here with their full version history.'
                    : "Upload floor plans, permits, reports, and other files to organize this project's documents."
              }
              action={!filtered && canUpload ? <DocumentUploadButton projectId={id} canShare={manager} /> : undefined}
            />
          ) : (
            <>
              <DocumentLibrary rows={list.rows} mode="project" canEdit={!project.archived_at} canManage={manager} people={people} projectId={id} archivedView={archived} />
              <DocumentPagination base={base} params={sp} page={list.page} pageCount={list.pageCount} total={list.total} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
