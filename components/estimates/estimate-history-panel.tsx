import Link from 'next/link'
import { FileSignature, GitCompare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EstimateStatusBadge } from '@/components/estimates/estimate-status-badge'
import { SignatureBadge } from '@/components/signatures/signature-badge'
import { formatCentsExact, type EstimateStatus } from '@/lib/estimates'
import { formatDate, formatDateTime } from '@/lib/format'
import type { EstimateSigningCopy } from '@/lib/esign/queries'
import { cn } from '@/lib/utils'

export type HistoryRevision = {
  id: string
  revision: number
  status: EstimateStatus
  construction_total_cents: number
  updated_at: string | null
}

export function EstimateHistoryPanel({
  currentId,
  revisions,
  previousId,
  fromQuery,
  files,
  documentsHref,
}: {
  currentId: string
  revisions: HistoryRevision[]
  previousId: string | null
  fromQuery: string | null
  files: EstimateSigningCopy[]
  documentsHref: string | null
}) {
  const revisionNumber = new Map(revisions.map((r) => [r.id, r.revision]))
  const sortedFiles = [...files].sort((a, b) => (revisionNumber.get(b.estimateId) ?? 0) - (revisionNumber.get(a.estimateId) ?? 0))
  const revHref = (revId: string) => `/estimates/${revId}${fromQuery ? `?from=${encodeURIComponent(fromQuery)}` : ''}`

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="revisions-heading" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="revisions-heading" className="text-sm font-semibold text-foreground">
            {`Revisions (${revisions.length})`}
          </h2>
          {previousId && (
            <Button
              variant="outline"
              size="sm"
              render={<Link href={`/estimates/${currentId}/compare?with=${previousId}`} />}
              nativeButton={false}
            >
              <GitCompare data-icon="inline-start" />
              Compare with previous
            </Button>
          )}
        </div>
        <div className="overflow-x-auto rounded-surface border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Revision</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Construction total</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {revisions.map((rev) => {
                const current = rev.id === currentId
                return (
                  <TableRow key={rev.id} data-state={current ? 'selected' : undefined}>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <Link
                          href={revHref(rev.id)}
                          aria-current={current ? 'page' : undefined}
                          className={cn('font-medium hover:text-primary hover:underline', current && 'text-primary')}
                        >
                          {`Revision ${rev.revision}`}
                        </Link>
                        {current && (
                          <span className="rounded-badge bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">Current</span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell>
                      <EstimateStatusBadge status={rev.status} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {rev.updated_at ? formatDateTime(rev.updated_at) : '—'}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{formatCentsExact(rev.construction_total_cents)}</TableCell>
                    <TableCell className="text-right">
                      {!current && (
                        <Link
                          href={`/estimates/${currentId}/compare?with=${rev.id}`}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          {`Compare`}
                          <span className="sr-only">{` with revision ${rev.revision}`}</span>
                        </Link>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </section>

      {documentsHref && (
        <section aria-labelledby="files-heading" className="flex flex-col gap-2">
          <h2 id="files-heading" className="text-sm font-semibold text-foreground">
            {`Signing copies (${files.length})`}
          </h2>
          {sortedFiles.length === 0 ? (
            <p className="text-sm text-muted-foreground">No signing copies yet.</p>
          ) : (
            <ul className="flex flex-col divide-y rounded-surface border">
              {sortedFiles.map((file) => (
                <li key={file.documentId} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-sm">
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <FileSignature className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="truncate font-medium text-foreground" title={file.name}>
                      {file.name}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">PDF</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {revisionNumber.has(file.estimateId) ? `Revision ${revisionNumber.get(file.estimateId)}` : '—'}
                  </span>
                  <span className="w-24 text-xs text-muted-foreground">{file.createdAt ? formatDate(file.createdAt) : '—'}</span>
                  {file.summary && (
                    <SignatureBadge status={file.summary.status} signed={file.summary.signed} total={file.summary.total} />
                  )}
                  <Link href={documentsHref} className="text-xs font-medium text-primary hover:underline">
                    {'Open in documents'}
                    <span className="sr-only">{`: ${file.name}`}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
