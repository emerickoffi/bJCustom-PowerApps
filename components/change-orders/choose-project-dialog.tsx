'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, FolderOpen, Search } from 'lucide-react'
import { changeOrdersPath } from '@/lib/change-orders'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export type PickerProject = { id: string; name: string; project_number: string | null }

export function ChooseProjectDialog({ projects }: { projects: PickerProject[] }) {
  const [q, setQ] = useState('')
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return projects
    return projects.filter((p) => p.name.toLowerCase().includes(needle) || Boolean(p.project_number?.toLowerCase().includes(needle)))
  }, [projects, q])

  return (
    <Dialog onOpenChange={(open) => !open && setQ('')}>
      <DialogTrigger render={<Button size="lg" />}>
        <FolderOpen className="size-4" aria-hidden="true" />
        Choose a project
      </DialogTrigger>
      <DialogContent className="flex max-h-[min(80dvh,36rem)] flex-col gap-4 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Choose a project</DialogTitle>
          <DialogDescription>Open a project&apos;s Change orders tab to create its first change order.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <label htmlFor="co-project-picker-search" className="sr-only">
            Search projects
          </label>
          <Input
            id="co-project-picker-search"
            type="search"
            autoFocus
            placeholder="Search name or number"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-10 pl-9"
          />
        </div>
        <p className="sr-only" aria-live="polite">
          {visible.length} project{visible.length === 1 ? '' : 's'} found
        </p>
        {visible.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No projects match &ldquo;{q.trim()}&rdquo;.</p>
        ) : (
          <ul className="-mx-2 flex min-h-0 flex-col overflow-y-auto" aria-label="Projects">
            {visible.map((p) => (
              <li key={p.id}>
                <Link
                  href={changeOrdersPath(p.id)}
                  className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-sage/60 focus-visible:bg-sage/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium text-foreground">{p.name}</span>
                    {p.project_number && <span className="text-xs tabular-nums text-muted-foreground">{p.project_number}</span>}
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
