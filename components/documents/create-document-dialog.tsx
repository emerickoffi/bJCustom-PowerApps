'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, FilePlus2, FileSignature, FileDiff, Search, Send, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export type CreatableEstimate = { id: string; label: string; status: string }

type DocumentTypeOption = {
  key: string
  group: 'Customer documents' | 'Subcontractor & vendor'
  name: string
  purpose: string
  icon: LucideIcon
  href?: string
}

/**
 * Only document types with a working creation workflow are listed. Each one hands off to the
 * existing business record flow so no parallel document or financial record is created here.
 */
export function CreateDocumentDialog({
  projectId,
  estimates,
  changeOrders,
  bidRequests,
}: {
  projectId: string
  /** Null when the estimates feature is off. */
  estimates: CreatableEstimate[] | null
  changeOrders: boolean
  bidRequests: boolean
}) {
  const [query, setQuery] = useState('')
  const [proposalOpen, setProposalOpen] = useState(false)

  const options = useMemo(() => {
    const list: DocumentTypeOption[] = []
    if (estimates) {
      list.push({ key: 'proposal', group: 'Customer documents', name: 'Proposal', purpose: 'Client-ready proposal from an estimate', icon: FileSignature })
    }
    if (changeOrders) {
      list.push({
        key: 'change-order',
        group: 'Customer documents',
        name: 'Change order',
        purpose: 'Scope or price change for homeowner approval',
        icon: FileDiff,
        href: `/projects/${projectId}/change-orders/new`,
      })
    }
    if (bidRequests) {
      list.push({
        key: 'bid-request',
        group: 'Subcontractor & vendor',
        name: 'Bid request',
        purpose: 'Request a quote from a subcontractor',
        icon: Send,
        href: `/projects/${projectId}/subcontractor-work/quotes/new`,
      })
    }
    return list
  }, [estimates, changeOrders, bidRequests, projectId])

  if (options.length === 0) return null

  const q = query.trim().toLowerCase()
  const visible = q ? options.filter((o) => `${o.name} ${o.purpose}`.toLowerCase().includes(q)) : options
  const groups = Array.from(new Set(visible.map((o) => o.group)))

  return (
    <Dialog onOpenChange={(open) => !open && (setQuery(''), setProposalOpen(false))}>
      <DialogTrigger render={<Button variant="outline" />}>
        <FilePlus2 data-icon="inline-start" />
        Create document
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create document</DialogTitle>
          <DialogDescription>Choose a document type. Each one opens its existing workflow.</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search document types"
            aria-label="Search document types"
            className="pl-8"
          />
        </div>

        <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto">
          {visible.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No matching document types.</p>}
          {groups.map((group) => (
            <section key={group} aria-label={group} className="flex flex-col gap-1">
              <h3 className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{group}</h3>
              <ul className="flex flex-col">
                {visible
                  .filter((o) => o.group === group)
                  .map((o) => (
                    <li key={o.key}>
                      {o.href ? (
                        <Link href={o.href} className={rowClass}>
                          <TypeRow option={o} />
                        </Link>
                      ) : (
                        <>
                          <button
                            type="button"
                            className={cn(rowClass, 'w-full')}
                            aria-expanded={proposalOpen}
                            onClick={() => setProposalOpen((v) => !v)}
                          >
                            <TypeRow option={o} expanded={proposalOpen} />
                          </button>
                          {proposalOpen && <EstimatePicker estimates={estimates ?? []} projectId={projectId} />}
                        </>
                      )}
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

const rowClass =
  'flex items-center gap-3 rounded-md px-2 py-2 text-left outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50'

function TypeRow({ option, expanded }: { option: DocumentTypeOption; expanded?: boolean }) {
  const Icon = option.icon
  return (
    <>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-medium text-foreground">{option.name}</span>
        <span className="truncate text-xs text-muted-foreground">{option.purpose}</span>
      </span>
      <ChevronRight className={cn('size-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-90')} aria-hidden="true" />
    </>
  )
}

function EstimatePicker({ estimates, projectId }: { estimates: CreatableEstimate[]; projectId: string }) {
  if (estimates.length === 0) {
    return (
      <div className="ml-11 flex flex-col items-start gap-2 py-2 text-sm text-muted-foreground">
        <p>A proposal is prepared from an estimate. This project has none yet.</p>
        <Button size="sm" variant="outline" render={<Link href={`/projects/${projectId}/estimates`} />} nativeButton={false}>
          Go to estimates
        </Button>
      </div>
    )
  }
  return (
    <ul className="ml-11 flex flex-col py-1" aria-label="Choose an estimate">
      {estimates.map((e) => (
        <li key={e.id}>
          <Link
            href={`/estimates/${e.id}/proposal`}
            className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <span className="truncate text-foreground">{e.label}</span>
            <span className="shrink-0 text-xs capitalize text-muted-foreground">{e.status.replaceAll('_', ' ')}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
