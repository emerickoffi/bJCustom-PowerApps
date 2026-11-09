import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Archive, FileCheck2, FolderOpen, SearchX } from 'lucide-react'
import { canManage, requireStaff } from '@/lib/session'
import { getOrgFeatures, requireFeature } from '@/lib/features'
import { getSignatureSummaries } from '@/lib/esign/queries'
import { createClient } from '@/lib/supabase/server'
import { DocumentLibrary } from '@/components/documents/document-library'
import { DocumentUploadButton } from '@/components/documents/document-upload-button'
import { DocumentToolbar } from '@/components/documents/document-toolbar'
import { CategoryNav, DocumentPagination, browseHref, type BrowseParams } from '@/components/documents/document-browse'
import { countArchivedDocuments, countSignedDocuments, getCategoryCounts, listDocuments } from '@/lib/document-queries'
import { categoryLabel, isDocumentCategory } from '@/lib/documents'
import { getPeopleNames } from '@/lib/people'

export const metadata: Metadata = { title: 'Project documents' }

function CompactEmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-input bg-card px-6 py-8 text-center">
      <span className="flex size-9 items-center justify-center rounded-lg bg-sage text-primary ring-1 ring-inset ring-primary/10">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="flex max-w-sm flex-col gap-1">
        <h2 className="font-serif text-base font-semibold text-foreground">{title}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  )
}

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
  const category = isDocumentCategory(sp.category) ? sp.category : undefined
  const canUpload = !project.archived_at && !archived
  const totalCount = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : null
  const showSigned = features.e_signatures && signedCount !== null
  const clearFiltersHref = browseHref(base, {}, { category: sp.category, archived: archived ? '1' : undefined })

  function emptyState() {
    if (searched) {
      return (
        <CompactEmptyState
          icon={SearchX}
          title="No documents match your filters"
          description={
            category
              ? `Nothing in ${categoryLabel(category)} matches this search or visibility filter.`
              : 'Try a different search term or visibility filter.'
          }
          action={
            <Link
              href={clearFiltersHref}
              scroll={false}
              className="inline-flex min-h-9 items-center rounded-lg border border-input bg-card px-3 text-sm font-medium text-primary transition-colors hover:bg-interactive-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Clear filters
            </Link>
          }
        />
      )
    }
    if (archived) {
      return (
        <CompactEmptyState
          icon={Archive}
          title={category ? `No archived documents in ${categoryLabel(category)}` : 'No archived documents'}
          description="Documents you archive appear here with their full version history and can be restored."
        />
      )
    }
    if (category) {
      return (
        <CompactEmptyState
          icon={FolderOpen}
          title={`No documents in ${categoryLabel(category)}`}
          description={`Upload a file to ${categoryLabel(category)}, or choose another category.`}
          action={canUpload ? <DocumentUploadButton projectId={id} canShare={manager} defaultCategory={category} /> : undefined}
        />
      )
    }
    return (
      <CompactEmptyState
        icon={FolderOpen}
        title="No documents uploaded yet"
        description="Upload plans, permits, contracts, and other files to keep this project's documents in one place."
        action={canUpload ? <DocumentUploadButton projectId={id} canShare={manager} /> : undefined}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="font-serif text-xl font-semibold leading-tight tracking-tight text-foreground md:text-2xl">
            {archived ? 'Archived documents' : 'Documents'}
          </h1>
          {!archived && totalCount !== null && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="tabular-nums">{`${totalCount} document${totalCount === 1 ? '' : 's'}`}</span>
              {showSigned && (
                <>
                  <span aria-hidden="true">{'·'}</span>
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <FileCheck2 className="size-3.5" aria-hidden="true" />
                    {`${signedCount} signed`}
                  </span>
                </>
              )}
            </p>
          )}
        </div>
        {canUpload && <DocumentUploadButton projectId={id} canShare={manager} openFromUrl />}
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-5 tablet:flex-col">
        {counts && !archived && (
          <aside className="hidden lg:sticky lg:top-[calc(var(--app-header-h,4rem)+4rem)] lg:block lg:w-60 lg:shrink-0 tablet:hidden">
            <CategoryNav base={base} params={sp} counts={counts} compact />
          </aside>
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <DocumentToolbar
            base={base}
            params={sp}
            archived={archived}
            archivedCount={archivedCount}
            counts={archived ? null : counts}
          />

          {!list.ok ? (
            <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {list.error}
            </p>
          ) : list.rows.length === 0 ? (
            emptyState()
          ) : (
            <>
              <DocumentLibrary
                rows={list.rows}
                mode="project"
                canEdit={!project.archived_at}
                canManage={manager}
                people={people}
                projectId={id}
                archivedView={archived}
                signatures={{ enabled: features.e_signatures && !archived, summaries }}
                compact
              />
              <DocumentPagination base={base} params={sp} page={list.page} pageCount={list.pageCount} total={list.total} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
