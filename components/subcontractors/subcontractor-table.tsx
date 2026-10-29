import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { SUBCONTRACTOR_STATUS_LABELS, type SubcontractorCompany } from '@/lib/subcontractors'
import type { AssignedProject } from '@/lib/subcontractor-projects'

const VISIBLE_PROJECTS = 3

function ProjectList({ projects }: { projects: AssignedProject[] | undefined }) {
  if (!projects?.length) return <span className="text-muted-foreground">None</span>
  const shown = projects.slice(0, VISIBLE_PROJECTS)
  const hidden = projects.length - shown.length
  return (
    <ul className="flex flex-col gap-0.5" aria-label={`${projects.length} assigned ${projects.length === 1 ? 'project' : 'projects'}`}>
      {shown.map((p) => (
        <li key={p.id} className="max-w-56 truncate">
          <Link href={`/projects/${p.id}`} className="text-primary underline-offset-4 hover:underline">
            <span className="text-muted-foreground">{p.project_number}</span> {p.name}
          </Link>
        </li>
      ))}
      {hidden > 0 && (
        <li className="text-xs text-muted-foreground" title={projects.slice(VISIBLE_PROJECTS).map((p) => `${p.project_number} ${p.name}`).join(', ')}>
          +{hidden} more
        </li>
      )}
    </ul>
  )
}

export function SubcontractorTable({
  rows,
  projectsByCompany,
}: {
  rows: SubcontractorCompany[]
  projectsByCompany: Record<string, AssignedProject[]> | null
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border/80 bg-card shadow-xs">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Company</TableHead>
            <TableHead scope="col">Trade</TableHead>
            <TableHead scope="col">Email</TableHead>
            <TableHead scope="col">Phone</TableHead>
            {projectsByCompany && <TableHead scope="col">Projects</TableHead>}
            <TableHead scope="col">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-medium text-foreground">{row.company_name}</TableCell>
              <TableCell>{row.trade}</TableCell>
              <TableCell>
                {row.email ? (
                  <a href={`mailto:${row.email}`} className="text-primary underline-offset-4 hover:underline">
                    {row.email}
                  </a>
                ) : (
                  <span className="text-muted-foreground">Not provided</span>
                )}
              </TableCell>
              <TableCell>
                {row.phone ? (
                  <a href={`tel:${row.phone.replace(/[^0-9+]/g, '')}`} className="text-primary underline-offset-4 hover:underline">
                    {row.phone}
                  </a>
                ) : (
                  <span className="text-muted-foreground">Not provided</span>
                )}
              </TableCell>
              {projectsByCompany && (
                <TableCell className="align-top">
                  <ProjectList projects={projectsByCompany[row.id]} />
                </TableCell>
              )}
              <TableCell>
                <Badge variant={row.status === 'active' ? 'secondary' : 'outline'}>
                  {SUBCONTRACTOR_STATUS_LABELS[row.status]}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
