'use client'

import { useId, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSWRConfig } from 'swr'
import { ArrowRight, CheckCircle2, Loader2, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SemanticBadge } from '@/components/shared/semantic-badge'
import { ProjectStatusBadge } from '@/components/shared/status-badge'
import {
  PREVIEW_LINK_CLASS,
  PreviewDetail,
  PreviewDetails,
  PreviewEmail,
  PreviewEmpty,
  PreviewList,
  PreviewPhone,
  PreviewRecordLink,
  PreviewRetryButton,
  PreviewSection,
  PreviewSectionError,
  RecordPreviewBody,
  RecordPreviewHeader,
  RecordPreviewLayout,
} from '@/components/shared/record-preview'
import { SubcontractorStatusBadge } from '@/components/subcontractors/subcontractor-status-badge'
import { QualificationBadge } from '@/components/subcontractors/qualification-badge'
import { StarDisplay } from '@/components/subcontractors/performance-stars'
import { bulkAssignFromDirectoryAction } from '@/app/actions/directory-assignment'
import { ACTIVITY_STATUS_LABELS, type ActivityStatus } from '@/lib/schedule'
import { formatDate } from '@/lib/format'
import { formatRating, reviewCountLabel } from '@/lib/subcontractor-performance'
import { PREVIEW_LIST_LIMIT } from '@/lib/record-preview'
import type { SubcontractorStatus } from '@/lib/subcontractors'
import {
  SUBCONTRACTOR_PREVIEW_PANEL_ID,
  SUBCONTRACTOR_PREVIEW_PARAM,
  subcontractorPreviewApiPath,
  subcontractorPreviewErrorState,
  type AssignTarget,
  type SubcontractorPreview as PreviewData,
} from '@/lib/subcontractor-preview'

export type SubcontractorPreviewRecord = { id: string; name: string; trade: string; status: SubcontractorStatus }

/** The Subcontractors list with its on-demand details panel, sharing the Projects, Clients, and Contacts pattern. */
export function SubcontractorPreviewLayout({
  companies,
  children,
}: {
  companies: SubcontractorPreviewRecord[]
  children: React.ReactNode
}) {
  return (
    <RecordPreviewLayout
      records={companies}
      param={SUBCONTRACTOR_PREVIEW_PARAM}
      panelId={SUBCONTRACTOR_PREVIEW_PANEL_ID}
      label="Subcontractor preview"
      renderPreview={(company) => <SubcontractorPreview key={company.id} company={company} />}
    >
      {children}
    </RecordPreviewLayout>
  )
}

function SubcontractorPreview({ company }: { company: SubcontractorPreviewRecord }) {
  const url = subcontractorPreviewApiPath(company.id)
  const [assigning, setAssigning] = useState(false)
  return (
    <>
      <RecordPreviewHeader
        title={company.name}
        closeLabel="Close subcontractor preview"
        meta={
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="truncate text-xs text-muted-foreground">{company.trade}</span>
            <SubcontractorStatusBadge status={company.status} />
          </span>
        }
        actions={
          <Button variant="outline" size="sm" className="pointer-coarse:h-11" render={<Link href={`/subcontractors/${company.id}`} />} nativeButton={false}>
            Open details
            <ArrowRight data-icon="inline-end" />
          </Button>
        }
      />
      <RecordPreviewBody<PreviewData>
        url={url}
        recordId={company.id}
        loadingLabel={`Loading ${company.name}`}
        errorState={subcontractorPreviewErrorState}
      >
        {(preview) =>
          assigning && preview.assign.state === 'ready' ? (
            <AssignToProject
              url={url}
              companyName={preview.name}
              directoryCompanyId={preview.assign.directoryCompanyId}
              projects={preview.assign.projects}
              onDone={() => setAssigning(false)}
            />
          ) : (
            <PreviewSections preview={preview} url={url} onAssign={() => setAssigning(true)} />
          )
        }
      </RecordPreviewBody>
    </>
  )
}

/** A section whose own query failed, with a retry that reloads the panel. */
function SectionFailure({ url, children }: { url: string; children: React.ReactNode }) {
  const { mutate } = useSWRConfig()
  const [retrying, startRetry] = useTransition()
  return (
    <div className="flex flex-col items-start gap-2">
      <PreviewSectionError>{children}</PreviewSectionError>
      <PreviewRetryButton retrying={retrying} onRetry={() => startRetry(async () => void (await mutate(url)))} />
    </div>
  )
}

function PreviewSections({ preview, url, onAssign }: { preview: PreviewData; url: string; onAssign: () => void }) {
  const { contact, qualification, projects, assign, work, performance } = preview
  return (
    <>
      <PreviewSection title="Primary contact">
        {contact.state === 'error' ? (
          <SectionFailure url={url}>Contact details could not be loaded.</SectionFailure>
        ) : contact.primary ? (
          <PreviewDetails>
            {contact.primary.name && (
              <PreviewDetail label="Name">
                {contact.primary.name}
                {contact.primary.role && <span className="text-muted-foreground">{` · ${contact.primary.role}`}</span>}
              </PreviewDetail>
            )}
            <PreviewDetail label="Email">
              {contact.primary.email ? <PreviewEmail value={contact.primary.email} /> : <span className="text-muted-foreground">Not provided</span>}
            </PreviewDetail>
            <PreviewDetail label="Phone">
              {contact.primary.phone ? <PreviewPhone value={contact.primary.phone} /> : <span className="text-muted-foreground">Not provided</span>}
            </PreviewDetail>
          </PreviewDetails>
        ) : (
          <PreviewEmpty>No primary contact, email, or phone on file.</PreviewEmpty>
        )}
      </PreviewSection>

      {qualification.state !== 'hidden' && (
        <PreviewSection
          title="Qualification"
          action={
            qualification.state === 'ready' && (
              <Link href={qualification.href} className={PREVIEW_LINK_CLASS}>
                Review qualification
              </Link>
            )
          }
        >
          {qualification.state === 'error' ? (
            <SectionFailure url={url}>Qualification could not be loaded.</SectionFailure>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <QualificationBadge summary={qualification.summary} />
                {qualification.summary && qualification.summary.mandatory_total > 0 && (
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {`${qualification.summary.mandatory_satisfied} of ${qualification.summary.mandatory_total} required approved`}
                  </span>
                )}
              </div>
              {qualification.issues.length > 0 && (
                <PreviewList items={qualification.issues} limit={PREVIEW_LIST_LIMIT} itemKey={(i) => i.key}>
                  {(issue) => (
                    <div className="flex min-w-0 flex-1 items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate text-foreground">{issue.title}</span>
                      <SemanticBadge tone={issue.problem === 'Missing' ? 'neutral' : issue.problem === 'Expired' ? 'orange' : 'danger'}>
                        {issue.problem}
                      </SemanticBadge>
                    </div>
                  )}
                </PreviewList>
              )}
            </>
          )}
        </PreviewSection>
      )}

      {projects.state !== 'hidden' && (
        <PreviewSection
          title="Assigned projects"
          count={projects.state === 'ready' ? projects.items.length : undefined}
          action={
            assign.state === 'ready' && (
              <Button type="button" variant="outline" size="sm" className="pointer-coarse:h-11" onClick={onAssign}>
                <Plus data-icon="inline-start" />
                Assign to project
              </Button>
            )
          }
        >
          {projects.state === 'error' ? (
            <SectionFailure url={url}>Projects could not be loaded.</SectionFailure>
          ) : projects.items.length ? (
            <PreviewList items={projects.items} limit={PREVIEW_LIST_LIMIT} itemKey={(p) => p.id}>
              {(project) => (
                <>
                  <PreviewRecordLink href={project.href} name={project.name} detail={project.number ? `#${project.number}` : null} />
                  <ProjectStatusBadge status={project.status} className="shrink-0" />
                </>
              )}
            </PreviewList>
          ) : (
            <PreviewEmpty>Not assigned to any projects.</PreviewEmpty>
          )}
          {assign.state === 'unavailable' && (
            <p className="text-xs text-muted-foreground">
              {assign.reason}
              {assign.href && (
                <>
                  {' '}
                  <Link href={assign.href} className={PREVIEW_LINK_CLASS}>
                    Edit subcontractor
                  </Link>
                </>
              )}
            </p>
          )}
        </PreviewSection>
      )}

      {work.state !== 'hidden' && (
        <PreviewSection
          title="Assigned work"
          count={work.state === 'ready' ? work.total : undefined}
          action={
            work.state === 'ready' &&
            work.total > PREVIEW_LIST_LIMIT && (
              <Link href={work.href} className={PREVIEW_LINK_CLASS}>
                View all
              </Link>
            )
          }
        >
          {work.state === 'error' ? (
            <SectionFailure url={url}>Assigned work could not be loaded.</SectionFailure>
          ) : work.items.length ? (
            <ul className="flex flex-col gap-2.5">
              {work.items.slice(0, PREVIEW_LIST_LIMIT).map((item) => (
                <li key={item.id} className="flex min-w-0 items-center gap-2">
                  <PreviewRecordLink
                    href={item.href}
                    name={item.activityName}
                    detail={`${item.projectName} · ${ACTIVITY_STATUS_LABELS[item.status as ActivityStatus] ?? 'Not started'}`}
                  />
                  <span className={item.overdue ? 'shrink-0 text-xs font-medium text-destructive' : 'shrink-0 text-xs tabular-nums text-muted-foreground'}>
                    {item.plannedEnd ? `${item.overdue ? 'Overdue · ' : 'Due '}${formatDate(item.plannedEnd)}` : 'No due date'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <PreviewEmpty>No open schedule assignments.</PreviewEmpty>
          )}
        </PreviewSection>
      )}

      {performance.state !== 'hidden' && (
        <PreviewSection title="Performance">
          {performance.state === 'error' ? (
            <SectionFailure url={url}>Ratings could not be loaded.</SectionFailure>
          ) : performance.count > 0 && performance.average !== null ? (
            <div className="flex items-center gap-2 text-sm">
              <StarDisplay value={performance.average} />
              <span className="font-medium tabular-nums text-foreground">{formatRating(performance.average)}</span>
              <span className="text-xs text-muted-foreground">{reviewCountLabel(performance.count)}</span>
            </div>
          ) : (
            <PreviewEmpty>Not rated</PreviewEmpty>
          )}
        </PreviewSection>
      )}
    </>
  )
}

/**
 * Adds a project membership (not a schedule assignment) through the same save handler as the project People page.
 * The user always picks the project; nothing is preselected, and no portal access or notification is sent.
 */
function AssignToProject({
  url,
  companyName,
  directoryCompanyId,
  projects,
  onDone,
}: {
  url: string
  companyName: string
  directoryCompanyId: string
  projects: AssignTarget[]
  onDone: () => void
}) {
  const router = useRouter()
  const { mutate } = useSWRConfig()
  const searchId = useId()
  const [query, setQuery] = useState('')
  const [projectId, setProjectId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [saving, startSaving] = useTransition()

  const needle = query.trim().toLowerCase()
  const shown = needle
    ? projects.filter((p) => p.name.toLowerCase().includes(needle) || p.number.toLowerCase().includes(needle))
    : projects
  const chosen = projects.find((p) => p.id === projectId) ?? null

  const save = () => {
    if (!chosen) {
      setError('Choose a project.')
      return
    }
    setError(null)
    startSaving(async () => {
      try {
        const res = await bulkAssignFromDirectoryAction(chosen.id, [{ kind: 'company', id: directoryCompanyId }])
        const result = res.ok ? res.results[0] : null
        if (!result || result.outcome === 'failed') {
          setError(result?.reason ?? (!res.ok && 'error' in res && typeof res.error === 'string' ? res.error : 'The assignment could not be saved.'))
          return
        }
        setSaved(result.outcome === 'already_assigned' ? `${companyName} was already on ${chosen.name}.` : `Assigned to ${chosen.name}.`)
        await mutate(url)
        router.refresh()
      } catch {
        setError('The assignment could not be saved. Check your connection and try again.')
      }
    })
  }

  if (saved) {
    return (
      <div className="flex flex-col items-start gap-3 px-4 py-4">
        <p role="status" className="flex items-start gap-2 text-sm text-primary">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {saved}
        </p>
        <Button type="button" variant="outline" size="sm" className="pointer-coarse:h-11" onClick={onDone}>
          Back to details
        </Button>
      </div>
    )
  }

  return (
    <form
      className="flex flex-col gap-3 px-4 py-3.5"
      aria-label={`Assign ${companyName} to a project`}
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Assign to project</h3>
      {projects.length ? (
        <>
          <div className="relative">
            <label htmlFor={searchId} className="sr-only">
              Search projects
            </label>
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              id={searchId}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects"
              className="pl-8"
              autoComplete="off"
            />
          </div>
          <fieldset className="flex max-h-72 flex-col gap-1 overflow-y-auto rounded-md border border-border/70 p-1">
            <legend className="sr-only">Project</legend>
            {shown.length ? (
              shown.map((p) => (
                <label
                  key={p.id}
                  className="flex cursor-pointer items-center gap-2.5 rounded-sm px-2 py-2 text-sm hover:bg-[#F4F7F3] has-[:checked]:bg-interactive-soft"
                >
                  <input
                    type="radio"
                    name="project"
                    value={p.id}
                    checked={projectId === p.id}
                    onChange={() => setProjectId(p.id)}
                    className="size-4 accent-primary"
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium text-foreground">{p.name}</span>
                    {p.number && <span className="text-xs text-muted-foreground">{`#${p.number}`}</span>}
                  </span>
                  <ProjectStatusBadge status={p.status} className="shrink-0" />
                </label>
              ))
            ) : (
              <p className="px-2 py-2 text-sm text-muted-foreground">No projects match.</p>
            )}
          </fieldset>
        </>
      ) : (
        <PreviewEmpty>Already on every open project.</PreviewEmpty>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" className="pointer-coarse:h-11" onClick={onDone} disabled={saving}>
          Cancel
        </Button>
        {projects.length > 0 && (
          <Button type="submit" size="sm" className="pointer-coarse:h-11" disabled={saving}>
            {saving && <Loader2 data-icon="inline-start" className="animate-spin motion-reduce:animate-none" />}
            {saving ? 'Saving' : error ? 'Try again' : 'Assign'}
          </Button>
        )}
      </div>
    </form>
  )
}
