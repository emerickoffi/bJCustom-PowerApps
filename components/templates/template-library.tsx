'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { Archive, ArchiveRestore, Copy, Flag, Layers, ListChecks, Plus, Timer } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { createTemplateAction, duplicateTemplateAction, setTemplateArchivedAction } from '@/app/actions/project-templates'
import { describeDuration, type TemplateSummary } from '@/lib/project-templates'
import { formatDate } from '@/lib/format'

export type TemplateListItem = {
  id: string
  name: string
  description: string | null
  isStarter: boolean
  status: 'draft' | 'published'
  archived: boolean
  version: number | null
  updatedAt: string
  summary: TemplateSummary
}

function SummaryLine({ s }: { s: TemplateSummary }) {
  return (
    <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <div className="flex items-center gap-1">
        <Layers className="size-3.5" aria-hidden="true" />
        <dt className="sr-only">Phases</dt>
        <dd>{`${s.phases} ${s.phases === 1 ? 'phase' : 'phases'}`}</dd>
      </div>
      <div className="flex items-center gap-1">
        <ListChecks className="size-3.5" aria-hidden="true" />
        <dt className="sr-only">Activities</dt>
        <dd>{`${s.activities} ${s.activities === 1 ? 'activity' : 'activities'}`}</dd>
      </div>
      <div className="flex items-center gap-1">
        <Flag className="size-3.5" aria-hidden="true" />
        <dt className="sr-only">Milestones</dt>
        <dd>{`${s.milestones} ${s.milestones === 1 ? 'milestone' : 'milestones'}`}</dd>
      </div>
      <div className="flex items-center gap-1">
        <Timer className="size-3.5" aria-hidden="true" />
        <dt className="sr-only">Estimated duration</dt>
        <dd>{describeDuration(s.estimatedBusinessDays)}</dd>
      </div>
    </dl>
  )
}

function StatusBadge({ item }: { item: TemplateListItem }) {
  if (item.archived) return <Badge variant="outline">Archived</Badge>
  if (item.isStarter) return <Badge variant="secondary">Starter</Badge>
  if (item.status === 'published') return <Badge>{`Published · v${item.version ?? 1}`}</Badge>
  return <Badge variant="outline">Draft</Badge>
}

function TemplateCard({ item }: { item: TemplateListItem }) {
  const [pending, start] = useTransition()
  const run = (fn: () => Promise<{ ok: boolean; error?: string } | void>, success?: string) =>
    start(async () => {
      const res = await fn()
      if (res && !res.ok) toast.error(res.error ?? 'Something went wrong')
      else if (success) toast.success(success)
    })

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          {item.isStarter ? (
            <h3 className="type-section-title text-foreground">{item.name}</h3>
          ) : (
            <h3 className="type-section-title">
              <Link href={`/settings/templates/${item.id}`} className="text-foreground underline-offset-4 hover:text-primary hover:underline">
                {item.name}
              </Link>
            </h3>
          )}
          {item.description && <p className="line-clamp-2 text-sm text-muted-foreground">{item.description}</p>}
        </div>
        <StatusBadge item={item} />
      </div>
      <SummaryLine s={item.summary} />
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <span className="text-xs text-muted-foreground">
          {item.isStarter ? 'Provided by the platform. Duplicate it to customize.' : `Updated ${formatDate(item.updatedAt.slice(0, 10))}`}
        </span>
        <div className="flex flex-wrap gap-2">
          {!item.isStarter && !item.archived && (
            <Button variant="outline" size="sm" render={<Link href={`/settings/templates/${item.id}`} />} nativeButton={false}>
              Edit
            </Button>
          )}
          <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => duplicateTemplateAction(item.id))}>
            <Copy data-icon="inline-start" />
            Duplicate
          </Button>
          {!item.isStarter && (
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() =>
                run(
                  () => setTemplateArchivedAction(item.id, !item.archived),
                  item.archived ? 'Template restored' : 'Template archived. Existing projects are not affected.',
                )
              }
            >
              {item.archived ? <ArchiveRestore data-icon="inline-start" /> : <Archive data-icon="inline-start" />}
              {item.archived ? 'Restore' : 'Archive'}
            </Button>
          )}
        </div>
      </div>
    </li>
  )
}

function NewTemplateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            start(async () => {
              const res = await createTemplateAction(fd)
              if (res && !res.ok) setError(res.error)
            })
          }}
        >
          <DialogHeader>
            <DialogTitle>New project template</DialogTitle>
            <DialogDescription>Start from a blank template. You can add phases and activities next.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-template-name">Name</Label>
            <Input id="new-template-name" name="name" required minLength={2} maxLength={120} autoComplete="off" aria-invalid={!!error} aria-describedby={error ? 'new-template-error' : undefined} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-template-description">Description (optional)</Label>
            <Textarea id="new-template-description" name="description" maxLength={1000} rows={3} />
          </div>
          {error && (
            <p id="new-template-error" role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Creating…' : 'Create template'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function TemplateLibrary({ items }: { items: TemplateListItem[] }) {
  const [creating, setCreating] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const company = items.filter((i) => !i.isStarter && (showArchived || !i.archived))
  const archivedCount = items.filter((i) => !i.isStarter && i.archived).length
  const starters = items.filter((i) => i.isStarter && !i.archived)

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="company-templates" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 id="company-templates" className="type-section-title text-foreground">
              Your templates
            </h2>
            <p className="text-sm text-muted-foreground">Published templates appear when someone creates a project.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {archivedCount > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setShowArchived((v) => !v)} aria-pressed={showArchived}>
                {showArchived ? 'Hide archived' : `Show archived (${archivedCount})`}
              </Button>
            )}
            <Button onClick={() => setCreating(true)}>
              <Plus data-icon="inline-start" />
              New template
            </Button>
          </div>
        </div>
        {company.length === 0 ? (
          <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-border bg-white p-5">
            <p className="text-sm font-medium text-foreground">No company templates yet</p>
            <p className="text-sm text-muted-foreground">
              Duplicate a starter below, start from scratch, or open a finished project&apos;s schedule and choose
              &ldquo;Save as template&rdquo;.
            </p>
          </div>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {company.map((item) => (
              <TemplateCard key={item.id} item={item} />
            ))}
          </ul>
        )}
      </section>

      {starters.length > 0 && (
        <section aria-labelledby="starter-templates" className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 id="starter-templates" className="type-section-title text-foreground">
              Starter templates
            </h2>
            <p className="text-sm text-muted-foreground">
              Ready to use as-is when creating a project, or duplicate one to match how your company builds.
            </p>
          </div>
          <ul className="grid gap-3 md:grid-cols-2">
            {starters.map((item) => (
              <TemplateCard key={item.id} item={item} />
            ))}
          </ul>
        </section>
      )}
      <NewTemplateDialog open={creating} onOpenChange={setCreating} />
    </div>
  )
}
