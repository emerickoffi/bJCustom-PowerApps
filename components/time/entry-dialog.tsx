'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { NativeSelect } from '@/components/shared/form-field'
import { deleteTimeEntryAction, saveTimeEntryAction } from '@/app/actions/time'
import { TIME_COST_CATEGORIES } from '@/lib/time-tracking'

type Project = { id: string; name: string; project_number: string | null }
type Person = { user_id: string; name: string }

export type EntryDraft = {
  id?: string
  projectId: string
  category: string
  date: string
  start: string
  end: string
  breakMinutes: number
  notes: string
  userId?: string
}

/** Add or edit one block of time. Managers also choose whose time it is. */
export function EntryDialog({
  projects,
  people,
  draft,
  trigger = 'add',
}: {
  projects: Project[]
  people?: Person[]
  draft: EntryDraft
  trigger?: 'add' | 'edit'
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(draft)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const set = (patch: Partial<EntryDraft>) => setForm((f) => ({ ...f, ...patch }))

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    start(async () => {
      const r = await saveTimeEntryAction({ ...form, id: form.id, userId: form.userId })
      if (r.ok) {
        toast.success(r.message ?? 'Saved.')
        setOpen(false)
        router.refresh()
      } else setError(r.error)
    })
  }

  const prefix = form.id ?? 'new'
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) {
          setForm(draft)
          setError(null)
        }
      }}
    >
      {trigger === 'add' ? (
        <DialogTrigger render={<Button variant="outline" />}>
          <Plus className="size-4" aria-hidden="true" />
          Add time
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button variant="ghost" size="sm" aria-label="Edit time entry" />}>
          <Pencil className="size-4" aria-hidden="true" />
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Edit time' : 'Add time'}</DialogTitle>
            <DialogDescription>Saved time goes to a manager for approval.</DialogDescription>
          </DialogHeader>
          {people && people.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${prefix}-person`}>Person</Label>
              <NativeSelect id={`${prefix}-person`} value={form.userId ?? ''} onChange={(e) => set({ userId: e.target.value || undefined })} className="h-10">
                {people.map((p) => (
                  <option key={p.user_id} value={p.user_id}>
                    {p.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${prefix}-project`}>Project</Label>
              <NativeSelect id={`${prefix}-project`} value={form.projectId} onChange={(e) => set({ projectId: e.target.value })} className="h-10" required>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.project_number ? `${p.project_number} · ${p.name}` : p.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${prefix}-category`}>Cost code</Label>
              <NativeSelect id={`${prefix}-category`} value={form.category} onChange={(e) => set({ category: e.target.value })} className="h-10">
                {TIME_COST_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor={`${prefix}-date`}>Date</Label>
              <Input id={`${prefix}-date`} type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} className="h-10" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${prefix}-start`}>Start</Label>
              <Input id={`${prefix}-start`} type="time" value={form.start} onChange={(e) => set({ start: e.target.value })} className="h-10" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${prefix}-end`}>End</Label>
              <Input id={`${prefix}-end`} type="time" value={form.end} onChange={(e) => set({ end: e.target.value })} className="h-10" required />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${prefix}-break`}>Break (min)</Label>
              <Input
                id={`${prefix}-break`}
                inputMode="numeric"
                value={String(form.breakMinutes)}
                onChange={(e) => set({ breakMinutes: Number(e.target.value.replace(/\D/g, '').slice(0, 3) || 0) })}
                className="h-10"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${prefix}-notes`}>Notes (optional)</Label>
              <Input id={`${prefix}-notes`} value={form.notes} maxLength={1000} onChange={(e) => set({ notes: e.target.value })} className="h-10" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">An end time earlier than the start counts as the next morning.</p>
          {error && (
            <p role="alert" className="rounded-xl bg-champagne-soft px-3 py-2 text-sm text-foreground">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function DeleteEntryButton({ id }: { id: string }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [pending, start] = useTransition()
  if (!confirming) {
    return (
      <Button variant="ghost" size="sm" aria-label="Delete time entry" onClick={() => setConfirming(true)}>
        <Trash2 className="size-4" aria-hidden="true" />
      </Button>
    )
  }
  return (
    <span className="flex items-center gap-1">
      <Button
        variant="destructive"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await deleteTimeEntryAction(id)
            if (r.ok) {
              toast.success(r.message ?? 'Deleted.')
              router.refresh()
            } else toast.error(r.error)
            setConfirming(false)
          })
        }
      >
        Delete
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        Keep
      </Button>
    </span>
  )
}
