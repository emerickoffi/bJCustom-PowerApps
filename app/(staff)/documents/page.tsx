import type { Metadata } from 'next'
import Link from 'next/link'
import { Archive, Building2, FolderKanban, FolderOpen } from 'lucide-react'
import { canManage, requireStaff } from '@/lib/session'
import { requireFeature } from '@/lib/features'
import { PageHeader, EmptyState } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { DocumentLibrary } from '@/components/documents/document-library'
import { DocumentUploadButton } from '@/components/documents/document-upload-button'
import { DocumentFiltersForm, DocumentPagination, browseHref, type BrowseParams } from '@/components/documents/document-browse'
import { countArchivedDocuments, listDocumentProjects, listDocuments } from '@/lib/document-queries'
import { getPeopleNames } from '@/lib/people'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Documents' }

type Tab = 'projects' | 'company'

function TabLink({ href, active, icon: Icon, children }: { href: string; active: boolean; icon: typeof FolderKanban; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        '-mb-px flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-medium transition-colors',
        active ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
      {children}
    </Link>
  )
}

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
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={FolderOpen}
        title={archived ? 'Archived documents' : 'Documents'}
        description="Your central workspace for project files and internal company records. Every document stays private until you choose to share it."
        actions={uploadAction}
      />

      <nav aria-label="Document libraries" className="flex gap-6 border-b border-[#E2E8E2]">
        <TabLink href={base} active={!isCompany} icon={FolderKanban}>
          Project Documents
        </TabLink>
        {manager && (
          <TabLink href={browseHref(base, {}, { tab: 'company' })} active={isCompany} icon={Building2}>
            Company Library
          </TabLink>
        )}
      </nav>

      <DocumentFiltersForm
        key={tab}
        params={params}
        scope={isCompany ? 'company' : 'project'}
        showVisibility={!isCompany}
        showArchived
        projectOptions={isCompany ? undefined : projectOptions}
      />
      <div className="flex justify-end">
        <Link
          href={browseHref(base, { ...tabParams, project: projectFilter }, archived ? {} : { archived: '1' })}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
        >
          <Archive className="size-4" aria-hidden="true" />
          {archived ? 'Back to active documents' : `Archived documents (${archivedCount})`}
        </Link>
      </div>

      {!list.ok ? (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{list.error}</p>
      ) : list.rows.length === 0 ? (
        filtered ? (
          <EmptyState icon={FolderOpen} title="No matching documents" description="Try a different search, project, or category." />
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
              <Button variant="outline" render={<Link href="/projects" />}>
                Go to Projects
              </Button>
            }
          />
        )
      ) : (
        <>
          <DocumentLibrary
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
  )
}
