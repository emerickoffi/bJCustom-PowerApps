import type { Metadata } from 'next'
import Link from 'next/link'
import { Archive, FolderOpen } from 'lucide-react'
import { canManage, requireStaff } from '@/lib/session'
import { requireFeature } from '@/lib/features'
import { PageHeader, EmptyState } from '@/components/shared/page-header'
import { DocumentLibrary } from '@/components/documents/document-library'
import { DocumentFiltersForm, DocumentPagination, browseHref, type BrowseParams } from '@/components/documents/document-browse'
import { countArchivedDocuments, listDocuments } from '@/lib/document-queries'
import { getPeopleNames } from '@/lib/people'

export const metadata: Metadata = { title: 'Documents' }

export default async function CompanyDocumentsPage({ searchParams }: { searchParams: Promise<BrowseParams> }) {
  const session = await requireStaff()
  await requireFeature(session.organizationId, 'documents')
  const sp = await searchParams
  const archived = sp.archived === '1'
  const base = '/documents'

  const [list, archivedCount] = await Promise.all([
    listDocuments({ q: sp.q, category: sp.category, visibility: sp.visibility, archived, page: Number(sp.page) || 1 }, { withProject: true }),
    countArchivedDocuments(),
  ])
  const people = list.ok ? await getPeopleNames(list.rows.map((r) => r.current_version?.uploaded_by)) : {}
  const filtered = Boolean(sp.q || sp.category || sp.visibility)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={FolderOpen}
        title={archived ? 'Archived documents' : 'Documents'}
        description="Recently updated documents across the projects you can access. Upload from a project's Documents page."
      />
      <DocumentFiltersForm params={sp} showVisibility showArchived />
      <div className="flex justify-end">
        <Link href={browseHref(base, {}, archived ? {} : { archived: '1' })} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary">
          <Archive className="size-4" aria-hidden="true" />
          {archived ? 'Back to active documents' : `Archived documents (${archivedCount})`}
        </Link>
      </div>
      {!list.ok ? (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{list.error}</p>
      ) : list.rows.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title={filtered ? 'No matching documents' : 'No documents yet'}
          description={filtered ? 'Try a different search or category.' : 'Open a project and choose Documents to upload its first file.'}
        />
      ) : (
        <>
          <DocumentLibrary rows={list.rows} mode="company" canEdit canManage={canManage(session.role)} people={people} archivedView={archived} />
          <DocumentPagination base={base} params={sp} page={list.page} pageCount={list.pageCount} total={list.total} />
        </>
      )}
    </div>
  )
}
