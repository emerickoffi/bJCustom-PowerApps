import Link from 'next/link'
import { Eye, FolderKanban, Mail, Pencil, Phone } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { DIRECTORY_TH_TEXT, DIRECTORY_THEAD_ROW } from '@/lib/directory-table-styles'
import { SUBCONTRACTOR_STATUS_LABELS, type SubcontractorCompany, type SubcontractorStatus } from '@/lib/subcontractors'
import type { AssignedProject } from '@/lib/subcontractor-projects'
import { companyInitials, projectCountLabel } from '@/lib/subcontractor-directory'
import { SubcontractorRowActions } from '@/components/subcontractors/subcontractor-row-actions'

type Props = {
  rows: SubcontractorCompany[]
  projectsByCompany: Record<string, AssignedProject[]> | null
}

const inlineActionClass =
  'inline-flex h-8 items-center gap-1.5 rounded-md border border-border/80 bg-card px-2.5 text-xs font-medium text-foreground/80 transition-colors hover:border-primary/30 hover:bg-[#F4F7F3] hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

function CompanyAvatar({ name, status }: { name: string; status: SubcontractorStatus }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-lg text-sm font-semibold ring-1 ring-inset',
        status === 'active' ? 'bg-[#EAF0E9] text-primary ring-primary/10' : 'bg-muted text-muted-foreground ring-border',
      )}
    >
      {companyInitials(name)}
    </span>
  )
}

function StatusBadge({ status }: { status: SubcontractorStatus }) {
  const active = status === 'active'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
      )}
    >
      <span className={cn('size-1.5 rounded-full', active ? 'bg-primary' : 'bg-muted-foreground/60')} aria-hidden="true" />
      {SUBCONTRACTOR_STATUS_LABELS[status]}
    </span>
  )
}

function CompanyCell({ row }: { row: SubcontractorCompany }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <CompanyAvatar name={row.company_name} status={row.status} />
      <div className="flex min-w-0 flex-col">
        <Link
          href={`/subcontractors/${row.id}`}
          className="truncate font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:underline"
        >
          {row.company_name}
        </Link>
        <span className="truncate text-sm text-muted-foreground">{row.trade}</span>
      </div>
    </div>
  )
}

function ContactLines({ row }: { row: SubcontractorCompany }) {
  if (!row.email && !row.phone) return <span className="text-sm text-muted-foreground/80">Not provided</span>
  return (
    <div className="flex min-w-0 flex-col gap-1 text-sm">
      {row.email && (
        <a
          href={`mailto:${row.email}`}
          className="flex min-w-0 items-center gap-2 text-foreground/85 underline-offset-4 hover:text-primary hover:underline"
        >
          <Mail className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate">{row.email}</span>
        </a>
      )}
      {row.phone && (
        <a
          href={`tel:${row.phone.replace(/[^0-9+]/g, '')}`}
          className="flex items-center gap-2 text-foreground/85 underline-offset-4 hover:text-primary hover:underline"
        >
          <Phone className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="tabular-nums">{row.phone}</span>
        </a>
      )}
    </div>
  )
}

function ProjectsSummary({ projects }: { projects: AssignedProject[] | undefined }) {
  const count = projects?.length ?? 0
  if (!count) return <span className="text-sm text-muted-foreground/80">No projects</span>
  const names = projects!.map((p) => `${p.project_number} ${p.name}`)
  return (
    <div className="flex min-w-0 flex-col" title={names.join(', ')}>
      <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        <FolderKanban className="size-3.5 text-muted-foreground" aria-hidden="true" />
        {projectCountLabel(count)}
      </span>
      <span className="truncate text-xs text-muted-foreground">
        {names[0]}
        {count > 1 ? ` +${count - 1} more` : ''}
      </span>
    </div>
  )
}

export function SubcontractorTable({ rows, projectsByCompany }: Props) {
  const showProjects = projectsByCompany !== null
  return (
    <>
      <div className="hidden overflow-hidden rounded-xl border border-border/70 bg-card shadow-xs md:block">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className={DIRECTORY_THEAD_ROW}>
              <TableHead scope="col" className={cn(DIRECTORY_TH_TEXT, "w-[30%] pl-5")}>
                Company / Trade
              </TableHead>
              <TableHead scope="col" className={cn(DIRECTORY_TH_TEXT, "w-[26%]")}>
                Contact
              </TableHead>
              {showProjects && (
                <TableHead scope="col" className={cn(DIRECTORY_TH_TEXT, "w-[17%]")}>
                  Projects
                </TableHead>
              )}
              <TableHead scope="col" className={cn(DIRECTORY_TH_TEXT, "w-[10%]")}>
                Status
              </TableHead>
              <TableHead scope="col" className={cn(DIRECTORY_TH_TEXT, "w-[200px] pr-5 text-right")}>
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id} className="hover:bg-[#F4F7F3]">
                <TableCell className="py-3.5 pl-5">
                  <CompanyCell row={row} />
                </TableCell>
                <TableCell className="py-3.5">
                  <ContactLines row={row} />
                </TableCell>
                {showProjects && (
                  <TableCell className="py-3.5">
                    <ProjectsSummary projects={projectsByCompany[row.id]} />
                  </TableCell>
                )}
                <TableCell className="py-3.5">
                  <StatusBadge status={row.status} />
                </TableCell>
                <TableCell className="py-3.5 pr-4 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <Link
                      href={`/subcontractors/${row.id}`}
                      aria-label={`View ${row.company_name}`}
                      className={inlineActionClass}
                    >
                      <Eye className="size-3.5" aria-hidden="true" />
                      View
                    </Link>
                    <Link
                      href={`/subcontractors/${row.id}/edit`}
                      aria-label={`Edit ${row.company_name}`}
                      className={inlineActionClass}
                    >
                      <Pencil className="size-3.5" aria-hidden="true" />
                      Edit
                    </Link>
                    <SubcontractorRowActions
                      companyId={row.id}
                      companyName={row.company_name}
                      status={row.status}
                      includeNavigation={false}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="flex flex-col divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70 bg-card shadow-xs md:hidden">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-col gap-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <CompanyCell row={row} />
              <div className="-mr-1.5 -mt-1 shrink-0">
                <SubcontractorRowActions companyId={row.id} companyName={row.company_name} status={row.status} />
              </div>
            </div>
            <ContactLines row={row} />
            <div className="flex items-center justify-between gap-3 border-t border-border/50 pt-3">
              {showProjects ? <ProjectsSummary projects={projectsByCompany[row.id]} /> : <span />}
              <StatusBadge status={row.status} />
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}
