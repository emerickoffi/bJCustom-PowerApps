import type { Metadata } from 'next'
import Link from 'next/link'
import { AlertTriangle, Archive, Building2, FolderKanban, FolderOpen, SearchX } from 'lucide-react'
import { canManage, requireStaff } from '@/lib/session'
import { requireFeature } from '@/lib/features'
import { PageHeader, EmptyState } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { DocumentLibrary } from '@/components/documents/document-library'
import { DocumentUploadButton } from '@/components/documents/document-upload-button'
import { DocumentFiltersForm, DocumentPagination, browseHref, type BrowseParams } from '@/components/documents/document-browse'
import { countArchivedDocuments, listDocumentProjects, listDocuments } from '@/lib/document-queries'
import { getPeopleNames } from '@/lib/people'
import { cookies } from 'next/headers'
import { WorksheetFilters, worksheetResultsClass, type WorksheetFilter } from '@/components/shared/worksheet-filters'
import { RememberLibraryFilters } from '@/components/documents/remember-library-filters'
import {
  libraryFilterCookie,
  parseLibraryFilters,
  pickLibraryFilters,
  serializeLibraryFilters,
  type DocumentLibraryTab as Tab,
} from '@/lib/document-library-filters'

export const metadata: Metadata = { title: 'Documents' }

export default async function CompanyDocumentsPage({ searchParams }: { searchParams: Promise<BrowseParams> }) {
  const session = await requireStaff()
  await requireFeature(session.organizationId, 'documents')
  const sp = await searchParams
  const manager = canManage(session.role)
  const tab: Tab = sp.tab === 'company' && manager ? 'company' : 'projects'
  const isCompany = tab === 'company'
  const archived = sp.archived === '1'
  const base = '/documents'
  const tabParams: BrowseParams = isCompany ? { tab: 'company' } : {}

  const projects = isCompany ? [] : (await listDocumentProjects()) ?? []
  const projectOptions = projects.map((p) => ({
    id: p.id,
    label: [p.name, p.project_number].filter(Boolean).join(' · ') + (p.archived ? ' (archived)' : ''),
  }))
  const projectFilter = !isCompany && sp.project && projects.some((p) => p.id === sp.project) ? sp.project : undefined
  const params: BrowseParams = { ...sp, tab: tabParams.tab, project: projectFilter }
  const projectFilterName = projectFilter ? projects.find((p) => p.id === projectFilter)?.name : undefined

  const [list, archivedCount] = await Promise.all([
    listDocuments(
      {
        scope: isCompany ? 'company' : 'project',
        q: sp.q,
        category: sp.category,
        visibility: isCompany ? undefined : sp.visibility,
        projectId: projectFilter,
        archived,
        page: Number(sp.page) || 1,
      },
      { withProject: !isCompany },
    ),
    countArchivedDocuments(projectFilter, isCompany ? 'company' : 'project'),
  ])
  const people = list.ok ? await getPeopleNames(list.rows.map((r) => r.current_version?.uploaded_by)) : {}
  const filtered = Boolean(sp.q || sp.category || (!isCompany && (sp.visibility || projectFilter)))

  const cookieStore = await cookies()
  const libraryHref = (target: Tab) =>
    target === tab
      ? browseHref(base, { ...pickLibraryFilters(tab, { ...sp, project: projectFilter }), page: sp.page }, target === 'company' ? { tab: 'company' } : {})
      : browseHref(base, parseLibraryFilters(target, cookieStore.get(libraryFilterCookie(target))?.value), target === 'company' ? { tab: 'company' } : {})
  const libraryTabs: WorksheetFilter[] = [
    { key: 'projects', label: 'Project documents', href: libraryHref('projects'), active: !isCompany },
    ...(manager ? [{ key: 'company', label: 'Company library', href: libraryHref('company'), active: isCompany }] : []),
  ]

  const uploadAction = archived ? null : isCompany ? (
    <DocumentUploadButton scope="company" canShare={false} label="Upload company document" />
  ) : projectOptions.length > 0 ? (
    <DocumentUploadButton
      projectOptions={projectOptions.filter((_, i) => !projects[i].archived)}
      canShare={manager}
      label="Upload project document"
    />
  ) : null

  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <PageHeader
        icon={FolderOpen}
        title={archived ? 'Archived documents' : 'Documents'}
        count={list.ok ? { value: list.total, noun: 'document' } : undefined}
        meta={projectFilterName ? `Filtered to ${projectFilterName}` : undefined}
        actions={uploadAction}
      />

      <RememberLibraryFilters tab={tab} query={serializeLibraryFilters(tab, { ...sp, project: projectFilter })} />

      <div className="flex flex-col">
        <WorksheetFilters label="Document libraries" filters={libraryTabs} noun={{ one: 'document', many: 'documents' }} />
        <div className={worksheetResultsClass(true, 'gap-4 p-3 sm:p-4')}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <DocumentFiltersForm
              key={tab}
              params={params}
              scope={isCompany ? 'company' : 'project'}
              showVisibility={!isCompany}
              showArchived
              projectOptions={isCompany ? undefined : projectOptions}
              className="min-w-0 flex-1"
            />
            <Link
              href={browseHref(base, { ...tabParams, project: projectFilter }, archived ? {} : { archived: '1' })}
              className="flex shrink-0 items-center gap-1.5 self-end text-sm text-muted-foreground hover:text-primary lg:self-auto"
            >
              <Archive className="size-4" aria-hidden="true" />
              {archived ? 'Back to active documents' : `Archived documents (${archivedCount})`}
            </Link>
          </div>

          {!list.ok ? (
            <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <div className="flex flex-col gap-0.5">
                <p className="font-medium">{"Documents couldn't be loaded"}</p>
                <p>{list.error}</p>
              </div>
            </div>
          ) : list.rows.length === 0 ? (
            filtered ? (
              <EmptyState
                icon={SearchX}
                title="No matching documents"
                description="Try a different search, project, or category."
                action={
                  <Button variant="outline" render={<Link href={browseHref(base, tabParams, archived ? { archived: '1' } : {})} />} nativeButton={false}>
                    Clear filters
                  </Button>
                }
              />
            ) : archived ? (
              <EmptyState icon={Archive} title="No archived documents" description="Archived documents will appear here and can be restored." />
            ) : isCompany ? (
              <EmptyState
                icon={Building2}
                title="No company documents yet."
                description="Store company licenses, templates, policies, and other internal business files here."
                action={<DocumentUploadButton scope="company" canShare={false} label="Upload company document" />}
              />
            ) : (
              <EmptyState
                icon={FolderKanban}
                title="No project documents yet."
                description="Open a project to upload plans, permits, reports, and construction files."
                action={
                  <Button variant="outline" render={<Link href="/projects" />} nativeButton={false}>
                    Go to Projects
                  </Button>
                }
              />
            )
          ) : (
            <>
              <DocumentLibrary
                key={tab}
                rows={list.rows}
                mode={isCompany ? 'library' : 'company'}
                canEdit={isCompany ? manager : true}
                canManage={manager}
                people={people}
                archivedView={archived}
              />
              <DocumentPagination base={base} params={params} page={list.page} pageCount={list.pageCount} total={list.total} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
