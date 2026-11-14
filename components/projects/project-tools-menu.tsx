'use client'

import { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Popover } from '@base-ui/react/popover'
import { ChevronDown, LayoutGrid, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  filterProjectToolGroups,
  type ProjectTool,
  type ProjectToolGroup,
  type ProjectToolKey,
} from '@/lib/project-nav'

export type ProjectToolNavigate = (event: React.MouseEvent<HTMLAnchorElement>, tool: ProjectTool, href: string) => void

type ProjectToolsScopeValue = {
  /** Hrefs are already resolved, e.g. to the view a person last left a tool on. */
  groups: ProjectToolGroup[]
  activeKey: ProjectToolKey | null
  onNavigate: ProjectToolNavigate
}

type ProjectToolsContextValue = {
  scope: ProjectToolsScopeValue | null
  setScope: (scope: ProjectToolsScopeValue | null) => void
}

const ProjectToolsContext = createContext<ProjectToolsContextValue | null>(null)

/** Lives in the staff shell so the header can show the current project's tools beside the project selector. */
export function ProjectToolsProvider({ children }: { children: React.ReactNode }) {
  const [scope, setScope] = useState<ProjectToolsScopeValue | null>(null)
  const value = useMemo(() => ({ scope, setScope }), [scope])
  return <ProjectToolsContext.Provider value={value}>{children}</ProjectToolsContext.Provider>
}

/** Set by the project frame; cleared when leaving the project so the header selector disappears. */
export function ProjectToolsScope({ groups, activeKey, onNavigate }: ProjectToolsScopeValue) {
  const setScope = useContext(ProjectToolsContext)?.setScope
  const signature = JSON.stringify(groups)

  useEffect(() => {
    if (!setScope) return
    setScope({ groups: JSON.parse(signature) as ProjectToolGroup[], activeKey, onNavigate })
  }, [setScope, signature, activeKey, onNavigate])

  useEffect(() => {
    if (!setScope) return
    return () => setScope(null)
  }, [setScope])

  return null
}

/** Header placement; narrow screens show the same menu inside the project frame instead. */
export function ProjectToolsHeaderSlot() {
  const scope = useContext(ProjectToolsContext)?.scope
  if (!scope) return null
  return (
    <div className="hidden min-w-0 md:ml-1.5 md:flex">
      <ProjectToolsMenu {...scope} />
    </div>
  )
}

export function ProjectToolsMenu({ groups, activeKey, onNavigate, className }: ProjectToolsScopeValue & { className?: string }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const baseId = useId()
  const listId = `${baseId}-list`
  const optionId = (key: ProjectToolKey) => `${baseId}-${key}`

  const activeTool = groups.flatMap((g) => g.tools).find((tool) => tool.key === activeKey) ?? null
  const visibleGroups = filterProjectToolGroups(groups, query)
  const flat = visibleGroups.flatMap((group) => group.tools)
  const highlighted = flat[Math.min(highlight, flat.length - 1)] ?? null

  function handleOpenChange(next: boolean) {
    setOpen(next)
    setQuery('')
    if (next) {
      const current = groups.flatMap((g) => g.tools).findIndex((tool) => tool.key === activeKey)
      setHighlight(Math.max(0, current))
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return
    if (!flat.length) return
    const index = flat.findIndex((tool) => tool.key === highlighted?.key)
    let next: number | null = null
    if (event.key === 'ArrowDown') next = (index + 1) % flat.length
    else if (event.key === 'ArrowUp') next = (index - 1 + flat.length) % flat.length
    else if (event.key === 'Home' && !query) next = 0
    else if (event.key === 'End' && !query) next = flat.length - 1
    else if (event.key === 'Enter' && highlighted) {
      event.preventDefault()
      document.getElementById(optionId(highlighted.key))?.click()
      return
    }
    if (next === null) return
    event.preventDefault()
    setHighlight(next)
    document.getElementById(optionId(flat[next].key))?.scrollIntoView({ block: 'nearest' })
  }

  const label = activeTool?.label ?? 'Project tools'

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger
        aria-label={`Project tools. Current: ${label}`}
        className={cn(
          'inline-flex h-9 min-w-0 max-w-[13rem] items-center gap-2 rounded-md border bg-card px-2.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-sage data-[popup-open]:border-primary/40 data-[popup-open]:bg-sage',
          'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30',
          className,
        )}
      >
        <LayoutGrid className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={6} collisionPadding={8} className="z-50">
          <Popover.Popup
            initialFocus={inputRef}
            aria-label="Project tools"
            className="flex max-h-[min(var(--available-height),36rem)] w-[min(320px,calc(100vw-16px))] flex-col overflow-hidden rounded-menu border border-border bg-white shadow-md outline-none sm:w-[min(360px,calc(100vw-16px))] lg:w-[min(448px,calc(100vw-16px))]"
          >
            <div className="border-b border-border p-2.5 pb-2">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <input
                  ref={inputRef}
                  type="search"
                  role="combobox"
                  aria-expanded="true"
                  aria-controls={listId}
                  aria-autocomplete="list"
                  aria-activedescendant={highlighted ? optionId(highlighted.key) : undefined}
                  aria-label="Search project tools"
                  placeholder="Search project tools..."
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value)
                    setHighlight(0)
                  }}
                  onKeyDown={handleKeyDown}
                  className="h-9 w-full rounded-sm border border-border bg-white pl-7 pr-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 sm:h-8 [&::-webkit-search-cancel-button]:hidden"
                />
              </div>
            </div>

            <div id={listId} role="listbox" aria-label="Project tools" className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-2.5">
              {visibleGroups.length === 0 ? (
                <p className="px-2 py-4 text-center text-sm text-muted-foreground">No tools match “{query.trim()}”.</p>
              ) : (
                visibleGroups.map((group) => (
                  <div
                    key={group.key}
                    role="group"
                    aria-labelledby={`${baseId}-group-${group.key}`}
                    className="border-t border-border/70 pt-1.5 first:border-t-0 [&:not(:last-child)]:pb-1.5"
                  >
                    <div
                      id={`${baseId}-group-${group.key}`}
                      className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      {group.label}
                    </div>
                    <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 sm:gap-x-1.5 lg:grid-cols-3">
                      {group.tools.map((tool) => {
                        const current = tool.key === activeKey
                        const isHighlighted = tool.key === highlighted?.key
                        return (
                          <Link
                            key={tool.key}
                            id={optionId(tool.key)}
                            href={tool.href}
                            role="option"
                            tabIndex={-1}
                            aria-selected={current}
                            aria-current={current ? 'page' : undefined}
                            onMouseMove={() => {
                              if (!isHighlighted) setHighlight(flat.findIndex((t) => t.key === tool.key))
                            }}
                            onClick={(event) => {
                              onNavigate(event, tool, tool.href)
                              setOpen(false)
                              setQuery('')
                            }}
                            className={cn(
                              'flex min-h-11 min-w-0 items-center rounded-sm px-2 text-sm text-foreground transition-colors sm:min-h-8',
                              isHighlighted && !current && 'bg-sage',
                              current && 'bg-primary/10 font-semibold text-primary-pressed',
                              current && isHighlighted && 'bg-primary/15',
                            )}
                          >
                            <span className="truncate whitespace-nowrap">{tool.label}</span>
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
