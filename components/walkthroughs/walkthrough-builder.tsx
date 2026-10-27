'use client'

import { ClipboardList as ClipboardListIcon, ListChecks as ListChecksIcon } from 'lucide-react'
import { useActionState, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createWalkthroughAction } from '@/app/actions/walkthroughs'
import { initialActionState } from '@/lib/action-state'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'
import { FormActions, FormSection, SelectField, TextAreaField, TextField } from '@/components/shared/form-field'
import { DEFAULT_CHECKLIST, WALKTHROUGH_TYPE_LABELS } from '@/lib/walkthroughs'

type Section = { key: string; category: string; items: { key: string; label: string }[] }

let counter = 0
const key = () => `k${++counter}`

export function WalkthroughBuilder({ projectId }: { projectId: string }) {
  const [state, formAction] = useActionState(createWalkthroughAction.bind(null, projectId), initialActionState)
  const [sections, setSections] = useState<Section[]>(() =>
    DEFAULT_CHECKLIST.map((s) => ({ key: key(), category: s.category, items: s.items.map((label) => ({ key: key(), label })) })),
  )
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [newCategory, setNewCategory] = useState('')

  const payload = sections.flatMap((s) =>
    s.items.filter((i) => i.label.trim()).map((i) => ({ category: s.category.trim(), label: i.label.trim() })),
  )

  function updateSection(sectionKey: string, change: (s: Section) => Section) {
    setSections((prev) => prev.map((s) => (s.key === sectionKey ? change(s) : s)))
  }

  function addItem(sectionKey: string) {
    const label = drafts[sectionKey]?.trim()
    if (!label) return
    updateSection(sectionKey, (s) => ({ ...s, items: [...s.items, { key: key(), label }] }))
    setDrafts((d) => ({ ...d, [sectionKey]: '' }))
  }

  function addCategory() {
    const name = newCategory.trim()
    if (!name) return
    setSections((prev) => [...prev, { key: key(), category: name, items: [] }])
    setNewCategory('')
  }

  const v = state.values ?? {}
  const fe = state.fieldErrors ?? {}

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="items" value={JSON.stringify(payload)} />
      <FormSection icon={ClipboardListIcon} title="Details" description="The homeowner sees the title and instructions in their portal.">
        <TextField name="title" label="Title" required defaultValue={v.title ?? 'Final homeowner walkthrough'} error={fe.title} maxLength={160} className="sm:col-span-2" />
        <SelectField
          name="walkthrough_type"
          label="Type"
          required
          defaultValue={v.walkthrough_type ?? 'final'}
          options={Object.entries(WALKTHROUGH_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
          error={fe.walkthrough_type}
        />
        <TextField name="scheduled_date" label="Scheduled date" type="date" defaultValue={v.scheduled_date} error={fe.scheduled_date} />
        <TextAreaField
          name="instructions"
          label="Instructions for the homeowner"
          defaultValue={v.instructions}
          maxLength={2000}
          className="sm:col-span-2"
          hint="Optional. For example: walk each room in order and test every door, drawer, and fixture."
        />
      </FormSection>

      <FormSection
        icon={ListChecksIcon} title="Checklist"
        description={`${payload.length} items in ${sections.length} sections. Start from the standard template and adjust it for this home.`}
      >
        <div className="flex flex-col gap-4 sm:col-span-2">
          {sections.map((section) => (
            <fieldset key={section.key} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
              <div className="flex items-center gap-2">
                <legend className="sr-only">{section.category}</legend>
                <Input
                  aria-label="Section name"
                  value={section.category}
                  maxLength={80}
                  onChange={(e) => updateSection(section.key, (s) => ({ ...s, category: e.target.value }))}
                  className="h-9 font-medium"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSections((prev) => prev.filter((s) => s.key !== section.key))}
                >
                  Remove section
                </Button>
              </div>
              <ul className="flex flex-col gap-1">
                {section.items.map((item) => (
                  <li key={item.key} className="flex items-center gap-2">
                    <Input
                      aria-label="Checklist item"
                      value={item.label}
                      maxLength={160}
                      onChange={(e) =>
                        updateSection(section.key, (s) => ({
                          ...s,
                          items: s.items.map((i) => (i.key === item.key ? { ...i, label: e.target.value } : i)),
                        }))
                      }
                      className="h-9"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${item.label}`}
                      onClick={() => updateSection(section.key, (s) => ({ ...s, items: s.items.filter((i) => i.key !== item.key) }))}
                    >
                      <X />
                    </Button>
                  </li>
                ))}
              </ul>
              <div className="flex items-center gap-2">
                <Input
                  aria-label={`New item in ${section.category}`}
                  placeholder="Add an item"
                  value={drafts[section.key] ?? ''}
                  maxLength={160}
                  onChange={(e) => setDrafts((d) => ({ ...d, [section.key]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                      e.preventDefault()
                      addItem(section.key)
                    }
                  }}
                  className="h-9"
                />
                <Button type="button" variant="outline" size="sm" onClick={() => addItem(section.key)}>
                  <Plus data-icon="inline-start" />
                  Add
                </Button>
              </div>
            </fieldset>
          ))}
          <div className="flex items-center gap-2">
            <Input
              aria-label="New section name"
              placeholder="New section, e.g. Basement"
              value={newCategory}
              maxLength={80}
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                  e.preventDefault()
                  addCategory()
                }
              }}
              className="h-10"
            />
            <Button type="button" variant="outline" size="lg" onClick={addCategory}>
              <Plus data-icon="inline-start" />
              Add section
            </Button>
          </div>
        </div>
      </FormSection>

      <FormActions message={<FormMessage state={state} />}>
        <SubmitButton pendingLabel="Creating...">Create walkthrough</SubmitButton>
      </FormActions>
    </form>
  )
}
