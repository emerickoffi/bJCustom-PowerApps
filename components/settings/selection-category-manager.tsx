'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus } from 'lucide-react'
import {
  createSelectionCategoryAction,
  renameSelectionCategoryAction,
  setSelectionCategoryActiveAction,
  type CategoryActionResult,
} from '@/app/actions/selection-categories'
import { CATEGORY_NAME_MAX, DEFAULT_SELECTION_CATEGORIES, normalizeOptionName, type CategoryRecord } from '@/lib/selection-option-lists'
import { Surface } from '@/components/shared/page-header'
import { SemanticBadge } from '@/components/shared/semantic-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const isComposing = (e: React.KeyboardEvent) => e.nativeEvent.isComposing || e.keyCode === 229

export function SelectionCategoryManager({ records, manageable }: { records: CategoryRecord[]; manageable: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)

  function run(task: () => Promise<CategoryActionResult>, success: (name: string) => string, after?: () => void) {
    startTransition(async () => {
      const result = await task()
      if (!result.ok) return setMessage({ tone: 'error', text: result.error })
      setMessage({ tone: 'success', text: success(result.name) })
      after?.()
      router.refresh()
    })
  }

  const add = () => run(() => createSelectionCategoryAction(newName), (n) => `“${n}” is available on all projects.`, () => setNewName(''))
  const saveRename = () => editing && run(() => renameSelectionCategoryAction(editing.id, editing.name), (n) => `Renamed to “${n}”.`, () => setEditing(null))

  const active = records.filter((r) => !r.archived)
  const archived = records.filter((r) => r.archived)

  return (
    <div className="flex flex-col gap-4">
      <Surface className="flex flex-col gap-3 p-4">
        <Label htmlFor="new-category" className="text-sm font-medium">
          Add a category
        </Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="new-category"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isComposing(e)) {
                e.preventDefault()
                add()
              }
            }}
            maxLength={CATEGORY_NAME_MAX}
            placeholder="Smart home"
            autoComplete="off"
            disabled={pending}
          />
          <Button type="button" onClick={add} disabled={pending || normalizeOptionName(newName).length < 2}>
            <Plus className="size-4" aria-hidden="true" />
            Add category
          </Button>
        </div>
        {records.length === 0 && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Your forms currently offer Trefort&apos;s default list ({DEFAULT_SELECTION_CATEGORIES.slice(0, 3).join(', ')}, and more).
            Once you add your own categories, the dropdown shows your company&apos;s list instead.
          </p>
        )}
        {!manageable && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Renaming and deactivating become available once the latest database update is applied.
          </p>
        )}
        <p aria-live="polite" className={message?.tone === 'error' ? 'text-sm text-destructive' : 'text-sm text-primary'}>
          {message?.text}
        </p>
      </Surface>

      <CategoryList
        title={`Active (${active.length})`}
        empty="No saved categories yet."
        rows={active}
        editing={editing}
        pending={pending}
        manageable={manageable}
        onEdit={setEditing}
        onSave={saveRename}
        onToggle={(r) => run(() => setSelectionCategoryActiveAction(r.id, false), (n) => `“${n}” is deactivated. Existing selections keep it.`)}
      />
      {archived.length > 0 && (
        <CategoryList
          title={`Deactivated (${archived.length})`}
          rows={archived}
          editing={editing}
          pending={pending}
          manageable={manageable}
          onEdit={setEditing}
          onSave={saveRename}
          onToggle={(r) => run(() => setSelectionCategoryActiveAction(r.id, true), (n) => `“${n}” is active again.`)}
        />
      )}
    </div>
  )
}

function CategoryList({
  title,
  empty,
  rows,
  editing,
  pending,
  manageable,
  onEdit,
  onSave,
  onToggle,
}: {
  title: string
  empty?: string
  rows: CategoryRecord[]
  editing: { id: string; name: string } | null
  pending: boolean
  manageable: boolean
  onEdit: (value: { id: string; name: string } | null) => void
  onSave: () => void
  onToggle: (row: CategoryRecord) => void
}) {
  return (
    <Surface className="p-0">
      <h2 className="border-b px-4 py-3 text-sm font-semibold text-foreground">{title}</h2>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
              {editing?.id === r.id ? (
                <>
                  <Label htmlFor={`rename-${r.id}`} className="sr-only">
                    Rename {r.name}
                  </Label>
                  <Input
                    id={`rename-${r.id}`}
                    autoFocus
                    value={editing.name}
                    onChange={(e) => onEdit({ id: r.id, name: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !isComposing(e)) {
                        e.preventDefault()
                        onSave()
                      } else if (e.key === 'Escape') onEdit(null)
                    }}
                    maxLength={CATEGORY_NAME_MAX}
                    disabled={pending}
                    className="h-9 min-w-0 flex-1"
                  />
                  <Button size="sm" onClick={onSave} disabled={pending}>
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onEdit(null)} disabled={pending}>
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">{r.name}</span>
                  {r.archived && <SemanticBadge tone="neutral">Deactivated</SemanticBadge>}
                  {manageable && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => onEdit({ id: r.id, name: r.name })} disabled={pending} aria-label={`Rename ${r.name}`}>
                        <Pencil className="size-4" aria-hidden="true" />
                        Rename
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => onToggle(r)} disabled={pending}>
                        {r.archived ? 'Reactivate' : 'Deactivate'}
                      </Button>
                    </>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Surface>
  )
}
