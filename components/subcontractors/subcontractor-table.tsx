import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { SUBCONTRACTOR_STATUS_LABELS, type SubcontractorCompany } from '@/lib/subcontractors'

export function SubcontractorTable({ rows }: { rows: SubcontractorCompany[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border/80 bg-card shadow-xs">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Company</TableHead>
            <TableHead scope="col">Trade</TableHead>
            <TableHead scope="col">Email</TableHead>
            <TableHead scope="col">Phone</TableHead>
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
