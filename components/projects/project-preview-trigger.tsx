'use client'

import { createContext, createElement, useContext } from 'react'
import { PREVIEW_PANEL_ID } from '@/lib/project-preview'
import { cn } from '@/lib/utils'

export type ProjectPreviewContextValue = {
  selectedId: string | null
  select: (projectId: string) => void
}

export const ProjectPreviewContext = createContext<ProjectPreviewContextValue | null>(null)

const ROW_CONTROLS =
  'a, button, input, select, textarea, label, summary, [role="button"], [role="menuitem"], [role="checkbox"], [contenteditable="true"]'

/** Cards and table rows are both in the document; only the active view's trigger is laid out. */
export function findPreviewTrigger(projectId: string): HTMLElement | null {
  const triggers = document.querySelectorAll<HTMLElement>(`[data-preview-trigger="${CSS.escape(projectId)}"]`)
  return [...triggers].find((el) => el.offsetParent !== null) ?? null
}

/** The keyboard and screen-reader control for a project's preview. It selects; it never navigates. */
export function ProjectPreviewTrigger({
  projectId,
  projectName,
  className,
  labelClassName,
}: {
  projectId: string
  projectName: string
  className?: string
  labelClassName?: string
}) {
  const preview = useContext(ProjectPreviewContext)
  const selected = preview?.selectedId === projectId
  return (
    <button
      type="button"
      data-preview-trigger={projectId}
      aria-current={selected ? 'true' : undefined}
      aria-controls={selected ? PREVIEW_PANEL_ID : undefined}
      onClick={() => preview?.select(projectId)}
      className={cn(
        'cursor-pointer rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        className,
      )}
    >
      <span className="sr-only">Preview </span>
      <span className={labelClassName}>{projectName}</span>
    </button>
  )
}

/**
 * The card or row body. A plain click anywhere that is not a control of its own selects the project;
 * links, buttons, checkboxes, and menus inside keep their behavior, and dragging to select text does nothing.
 */
export function ProjectPreviewSurface({
  as = 'article',
  projectId,
  className,
  children,
}: {
  as?: 'article' | 'tr'
  projectId: string
  className?: string
  children: React.ReactNode
}) {
  const preview = useContext(ProjectPreviewContext)
  const selected = preview?.selectedId === projectId

  return createElement(
    as,
    {
      'data-preview-item': projectId,
      // The project's `data-selected` variant matches the value "true", not mere presence.
      'data-selected': selected ? 'true' : undefined,
      className: cn(preview && 'cursor-pointer', className),
      onClick: (event: React.MouseEvent<HTMLElement>) => {
        if (!preview || event.defaultPrevented || event.button !== 0) return
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        const control = (event.target as Element).closest(ROW_CONTROLS)
        if (control && event.currentTarget.contains(control)) return
        if (window.getSelection()?.toString()) return
        preview.select(projectId)
      },
    },
    children,
  )
}
