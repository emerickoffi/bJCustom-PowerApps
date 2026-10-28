import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Archive, FileCheck2, FileText, FolderOpen } from 'lucide-react'
import { canManage, requireStaff } from '@/lib/session'
import { getOrgFeatures, requireFeature } from '@/lib/features'
import { getSignatureSummaries } from '@/lib/esign/queries'
import { createClient } from '@/lib/supabase/server'
import { PageHeader, EmptyState } from '@/components/shared/page-header'
import { DocumentLibrary } from '@/components/documents/document-library'
import { DocumentUploadButton } from '@/components/documents/document-upload-button'
import { CategoryNav, DocumentFiltersForm, DocumentPagination, browseHref, type BrowseParams } from '@/components/documents/document-browse'
import { countArchivedDocuments, countSignedDocuments, getCategoryCounts, listDocuments } from '@/lib/document-queries'
import { getPeopleNames } from '@/lib/people'

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
  const [list, counts, archivedCount, signedCount] = await Promise.all([
    listDocuments({ projectId: id, q: sp.q, category: sp.category, visibility: sp.visibility, archived, page: Number(sp.page) || 1 }),
    getCategoryCounts(id),
    countArchivedDocuments(id),
    countSignedDocuments(id),
  ])
  const [people, features, summaries] = await Promise.all([
    list.ok ? getPeopleNames(list.rows.map((r) => r.current_version?.uploaded_by)) : Promise.resolve({}),
    getOrgFeatures(session.organizationId),
    list.ok ? getSignatureSummaries(list.rows.map((r) => r.id)) : Promise.resolve({}),
  ])
  const manager = canManage(session.role)
  const searched = Boolean(sp.q || sp.visibility)
  const filtered = searched || Boolean(sp.category)
  const canUpload = !project.archived_at && !archived
  const totalCount = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : null
  const showSigned = features.e_signatures && signedCount !== null

  const stats =
    !archived && totalCount !== null ? (
      <ul className="mt-1 flex flex-wrap items-center gap-2" aria-label="Document totals">
        <li className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-[#174D32] ring-1 ring-inset ring-[#174D32]/10">
          <FileText className="size-3.5" aria-hidden="true" />
          {`${totalCount} document${totalCount === 1 ? '' : 's'}`}
        </li>
        {showSigned && (
          <li className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-[#174D32] ring-1 ring-inset ring-[#174D32]/10">
            <FileCheck2 className="size-3.5" aria-hidden="true" />
            {`${signedCount} signed`}
          </li>
        )}
      </ul>
    ) : null

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={FolderOpen}
        backHref={`/projects/${id}`}
        backLabel={`Back to ${project.name}`}
        eyebrow={project.project_number}
        title={archived ? 'Archived documents' : 'Project Documents'}
        description={
          <>
            <p>
              {archived
                ? 'Archived documents keep every version and can be restored.'
                : 'Manage plans, permits, reports, contracts, and project files.'}
            </p>
            {stats}
          </>
        }
        actions={canUpload ? <DocumentUploadButton projectId={id} canShare={manager} openFromUrl /> : null}
      />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {counts && !archived && (
          <aside className="hidden lg:sticky lg:top-24 lg:block lg:w-[23%] lg:min-w-56 lg:max-w-72 lg:shrink-0">
            <CategoryNav base={base} params={sp} counts={counts} />
          </aside>
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex flex-col gap-3 rounded-xl border border-[#E2E8E2] bg-[#F8F7F3] p-3 md:p-4">
            <DocumentFiltersForm params={sp} showVisibility showArchived counts={archived ? null : counts} />
            <div className="flex justify-end border-t border-[#E2E8E2] pt-3">
              <Link
                href={browseHref(base, {}, archived ? {} : { archived: '1' })}
                className="flex min-h-9 items-center gap-1.5 rounded-md text-sm text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Archive className="size-4" aria-hidden="true" />
                {archived ? 'Back to active documents' : `Archived documents (${archivedCount})`}
              </Link>
            </div>
          </div>

          {!list.ok ? (
            <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {list.error}
            </p>
          ) : list.rows.length === 0 ? (
            <EmptyState
              icon={FolderOpen}
              title={
                searched
                  ? 'No matching documents.'
                  : sp.category
                    ? 'No documents in this category.'
                    : archived
                      ? 'No archived documents'
                      : 'No documents uploaded yet.'
              }
              description={
                searched
                  ? 'Try a different search term or visibility filter.'
                  : sp.category
                    ? archived
                      ? 'No archived documents match this category.'
                      : 'Upload a file to this category, or choose another category.'
                    : archived
                    ? 'Documents you archive appear here with their full version history.'
                    : "Upload floor plans, permits, reports, and other files to organize this project's documents."
              }
              action={!filtered && canUpload ? <DocumentUploadButton projectId={id} canShare={manager} /> : undefined}
            />
          ) : (
            <>
              <DocumentLibrary rows={list.rows} mode="project" canEdit={!project.archived_at} canManage={manager} people={people} projectId={id} archivedView={archived} signatures={{ enabled: features.e_signatures && !archived, summaries }} />
              <DocumentPagination base={base} params={sp} page={list.page} pageCount={list.pageCount} total={list.total} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
