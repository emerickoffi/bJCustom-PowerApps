'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { LifeBuoy, ShieldOff } from 'lucide-react'
import { grantSupportAccessAction, revokeSupportAccessAction } from '@/app/actions/support-access'
import { DEFAULT_SUPPORT_MINUTES, SUPPORT_DURATIONS } from '@/lib/support-access-shared'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

type ProjectOption = { id: string; name: string; project_number: string | null }

const projectLabel = (p: ProjectOption) => (p.project_number ? `${p.project_number} · ${p.name}` : p.name)

/** "Grant support access": ticket, one project, a short window. Read-only; the server checks everything again. */
export function GrantSupportAccessButton({ projects }: { projects: ProjectOption[] }) {
  const [open, setOpen] = useState(false)
  const [projectId, setProjectId] = useState('')
  const [ticket, setTicket] = useState('')
  const [note, setNote] = useState('')
  const [minutes, setMinutes] = useState<string>(String(DEFAULT_SUPPORT_MINUTES))
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()

  function reset() {
    setProjectId('')
    setTicket('')
    setNote('')
    setMinutes(String(DEFAULT_SUPPORT_MINUTES))
    setError(null)
    setFieldErrors({})
  }

  function submit() {
    setError(null)
    setFieldErrors({})
    startTransition(async () => {
      const result = await grantSupportAccessAction({ projectId, ticket, note, minutes: Number(minutes) })
      if (result.error) {
        setError(result.error)
        setFieldErrors(result.fieldErrors ?? {})
        return
      }
      toast.success(result.success ?? 'Support access granted.')
      setOpen(false)
      reset()
    })
  }

  const durationLabel = SUPPORT_DURATIONS.find((d) => String(d.minutes) === minutes)?.label ?? '1 hour'

  return (
    <>
      <Button variant="action" onClick={() => setOpen(true)} disabled={projects.length === 0}>
        <LifeBuoy data-icon="inline-start" aria-hidden="true" />
        Grant support access
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (pending) return
          setOpen(next)
          if (!next) reset()
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Grant support access</DialogTitle>
            <DialogDescription>
              Trefort support will be able to view this one project, read-only, until the time is up. You can revoke it
              sooner, and every page they open is logged here.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="support-ticket">Support ticket number</Label>
              <Input
                id="support-ticket"
                value={ticket}
                onChange={(e) => setTicket(e.target.value)}
                placeholder="For example: TKT-1042"
                maxLength={40}
                autoComplete="off"
                aria-invalid={Boolean(fieldErrors.ticket)}
              />
              {fieldErrors.ticket && <p className="text-xs text-destructive">{fieldErrors.ticket}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="support-project">Project</Label>
              <Select value={projectId || null} onValueChange={(v) => setProjectId(v ?? '')}>
                <SelectTrigger id="support-project" className="h-10 w-full" aria-invalid={Boolean(fieldErrors.projectId)}>
                  <SelectValue>
                    {(v: string | null) => {
                      const p = projects.find((x) => x.id === v)
                      return p ? projectLabel(p) : 'Choose a project'
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {projectLabel(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.projectId && <p className="text-xs text-destructive">{fieldErrors.projectId}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="support-duration">Access ends after</Label>
              <Select value={minutes} onValueChange={(v) => setMinutes(v ?? String(DEFAULT_SUPPORT_MINUTES))}>
                <SelectTrigger id="support-duration" className="h-10 w-full">
                  <SelectValue>{() => durationLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {SUPPORT_DURATIONS.map((d) => (
                    <SelectItem key={d.minutes} value={String(d.minutes)}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="support-note">Note for support (optional)</Label>
              <Textarea
                id="support-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What should they look at?"
                maxLength={500}
                rows={3}
              />
            </div>

            <p className="rounded-xl bg-sage/50 px-3 py-2 text-xs leading-relaxed text-foreground">
              Read-only: support cannot change, send or delete anything. Internal notes and homeowner contact details stay
              hidden.
            </p>
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="action" onClick={submit} disabled={pending}>
              {pending ? 'Granting...' : `Grant for ${durationLabel}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function RevokeSupportAccessButton({ grantId, projectName }: { grantId: string; projectName: string }) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  function revoke() {
    startTransition(async () => {
      const result = await revokeSupportAccessAction(grantId)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(result.success ?? 'Support access revoked.')
      setOpen(false)
    })
  }

  return (
    <>
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        <ShieldOff data-icon="inline-start" aria-hidden="true" />
        Revoke
      </Button>
      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke support access?</DialogTitle>
            <DialogDescription>
              {`Trefort support loses access to ${projectName} right away. You can grant it again later if they still need it.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Keep access
            </Button>
            <Button variant="destructive" onClick={revoke} disabled={pending}>
              {pending ? 'Revoking...' : 'Revoke now'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
