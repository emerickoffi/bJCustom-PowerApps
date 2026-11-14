import type { Metadata } from 'next'
import Link from 'next/link'
import { Images } from 'lucide-react'
import { loadProjectPhotoLibrary, requirePhotosProject } from '@/lib/project-photos-data'
import { parsePhotoFilters, photoFilterQuery, projectPhotosPath } from '@/lib/project-photos'
import { EmptyState, PageHeader } from '@/components/shared/page-header'
import { PhotoFiltersForm } from '@/components/photos/photo-filters'
import { PhotoLibrary } from '@/components/photos/photo-library'
import { ProjectPhotoUploader } from '@/components/photos/project-photo-uploader'
import { buttonVariants } from '@/components/ui/button'

export const metadata: Metadata = { title: 'Project photos' }

export default async function ProjectPhotosPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  const { project, features } = await requirePhotosProject(id)
  const filters = parsePhotoFilters(await searchParams)
  const library = await loadProjectPhotoLibrary(project.id, features, filters)
  const base = projectPhotosPath(project.id)
  const filtered = Boolean(filters.q || filters.source || filters.from || filters.to || filters.uploader || filters.location)
  const canUpload = features.project_photos && !library.directSetupRequired && !project.archived_at
  const page = Math.min(filters.page, library.pageCount)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Photos"
        icon={Images}
        count={{ value: library.total, noun: 'photo', plural: 'photos' }}
        actions={canUpload && <ProjectPhotoUploader projectId={project.id} />}
      />

      <p className="text-sm text-muted-foreground">
        {'Photos from daily logs, walkthroughs, issues, and published client updates appear here automatically. Each photo stays with the record it came from. Project uploads are visible to your team only.'}
      </p>

      <PhotoFiltersForm action={base} filters={filters} uploaders={library.uploaders} locations={library.locations} features={features} />

      {library.truncated && (
        <p role="status" className="text-sm text-muted-foreground">
          {'This view includes the 1,000 most recent photos from each source. Narrow the dates to find older photos.'}
        </p>
      )}

      {library.photos.length === 0 ? (
        <EmptyState
          title={filtered ? 'No photos match these filters' : 'No photos yet'}
          description={
            filtered
              ? 'Try a wider date range or clear the filters.'
              : canUpload
                ? 'Upload photos here, or add them to a daily log, walkthrough, or issue.'
                : 'Photos added to daily logs, walkthroughs, and issues will appear here.'
          }
        >
          {filtered && (
            <Link href={`${base}${photoFilterQuery({ view: filters.view })}`} className={buttonVariants({ variant: 'outline' })}>
              Clear filters
            </Link>
          )}
        </EmptyState>
      ) : (
        <PhotoLibrary
          key={`${page}-${filters.sort}-${filters.view}`}
          projectId={project.id}
          photos={library.photos}
          view={filters.view}
          readOnly={Boolean(project.archived_at) || !features.project_photos}
        />
      )}

      {library.pageCount > 1 && (
        <nav aria-label="Photo pages" className="flex items-center justify-between gap-3">
          {page > 1 ? (
            <Link href={`${base}${photoFilterQuery({ ...filters, page: page - 1 })}`} className={buttonVariants({ variant: 'outline' })}>
              Previous
            </Link>
          ) : (
            <span />
          )}
          <p className="text-sm text-muted-foreground">{`Page ${page} of ${library.pageCount}`}</p>
          {page < library.pageCount ? (
            <Link href={`${base}${photoFilterQuery({ ...filters, page: page + 1 })}`} className={buttonVariants({ variant: 'outline' })}>
              Next
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  )
}
