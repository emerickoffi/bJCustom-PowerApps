import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CheckCircle2, FolderKanban, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { requireManager } from '@/lib/session'
import { requireFeature } from '@/lib/features'
import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/format'
import { PROJECT_STATUS_LABELS, type ProjectStatus } from '@/lib/domain'
import { SUBCONTRACTOR_STATUS_LABELS } from '@/lib/subcontractors'
import { isUuid } from '@/lib/subcontractor-projects'
import { companyInitials, projectCountLabel } from '@/lib/subcontractor-directory'
import { loadAssociatedProjects, loadSubcontractor } from '@/lib/subcontractor-detail-data'
import { DetailList, PageHeader, SectionHeading, Surface } from '@/components/shared/page-header'
import { SubcontractorStatusButton } from '@/components/subcontractors/subcontractor-status-dialog'

export const metadata: Metadata = { title: 'Subcontractor' }

export default async function SubcontractorDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ saved?: string; projects?: string }>
}) {
  const session = await requireManager()
  await requireFeature(session.organizationId, 'subcontractors')
  const { id } = await params
  const sp = await searchParams
  if (!isUuid(id)) notFound()

  const supabase = await createClient()
  const company = await loadSubcontractor(supabase, session.organizationId, id)
  if (!company) notFound()
  const { availability, projects } = await loadAssociatedProjects(supabase, session.organizationId, id)
  const addedProjects = Number.parseInt(sp.projects ?? '', 10)

  return (
    <div className="flex w-full max-w-5xl flex-col gap-6">
      <PageHeader
        backHref="/subcontractors"
        backLabel="Subcontractors"
        eyebrow={company.trade}
        title={company.company_name}
        avatar={
          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white text-sm font-semibold text-primary ring-1 ring-inset ring-[#174D32]/12 md:size-11"
          >
            {companyInitials(company.company_name)}
          </span>
        }
        actions={
          <>
            <SubcontractorStatusButton companyId={company.id} companyName={company.company_name} status={company.status} />
            <Button size="lg" render={<Link href={`/subcontractors/${company.id}/edit`} />} nativeButton={false}>
              <Pencil data-icon="inline-start" />
              Edit
            </Button>
          </>
        }
      />

      {sp.saved && (
        <p role="status" className="flex items-start gap-2 rounded-md bg-primary/10 px-3 py-2 text-sm text-primary">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Changes saved
          {addedProjects > 0 ? ` and ${addedProjects} ${addedProjects === 1 ? 'project was' : 'projects were'} added.` : '.'}
        </p>
      )}

      <Surface aria-labelledby="details-heading">
        <SectionHeading id="details-heading" title="Company details" />
        <DetailList
          items={[
            { label: 'Trade', value: company.trade },
            { label: 'Status', value: SUBCONTRACTOR_STATUS_LABELS[company.status] },
            {
              label: 'Email',
              value: company.email ? (
                <a href={`mailto:${company.email}`} className="text-primary underline-offset-4 hover:underline">
                  {company.email}
                </a>
              ) : (
                <span className="font-normal text-muted-foreground">Not provided</span>
              ),
            },
            {
              label: 'Phone',
              value: company.phone ? (
                <a href={`tel:${company.phone.replace(/[^0-9+]/g, '')}`} className="text-primary underline-offset-4 hover:underline">
                  {company.phone}
                </a>
              ) : (
                <span className="font-normal text-muted-foreground">Not provided</span>
              ),
            },
            { label: 'Added', value: formatDate(company.created_at) },
          ]}
        />
      </Surface>

      <Surface aria-labelledby="projects-heading">
        <SectionHeading
          id="projects-heading"
          title="Projects"
          description={
            availability === 'ready'
              ? `${projectCountLabel(projects.length)}. Project association is separate from schedule activity assignments.`
              : undefined
          }
        />
        {availability === 'setup-required' ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            Project associations are not set up in this environment yet. Company details are unaffected.
          </p>
        ) : availability === 'error' ? (
          <p className="text-sm text-muted-foreground">Projects could not be loaded. Refresh the page to try again.</p>
        ) : projects.length === 0 ? (
          <p className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">Not associated with any project yet.</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border">
            {projects.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <Link
                  href={`/projects/${p.id}`}
                  className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
                >
                  <FolderKanban className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="truncate">
                    <span className="text-muted-foreground">{p.project_number}</span> {p.name}
                  </span>
                </Link>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {PROJECT_STATUS_LABELS[p.status as ProjectStatus] ?? p.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Surface>
    </div>
  )
}
