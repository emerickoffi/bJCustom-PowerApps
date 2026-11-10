'use client'

import { createContext, useCallback, useContext, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { Columns3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  OPTIONAL_PROJECT_COLUMNS,
  PROJECT_COLUMNS_COOKIE,
  serializeProjectColumns,
  type OptionalProjectColumn,
} from '@/lib/project-columns'

type ProjectColumnsValue = {
  shown: readonly OptionalProjectColumn[]
  toggle: (column: OptionalProjectColumn, show: boolean) => void
}

const ProjectColumnsContext = createContext<ProjectColumnsValue | null>(null)

/** The table keeps room for each column that is switched on, so its cells never crowd before it scrolls. */
const TABLE_MIN_WIDTH = ['56rem', '60rem', '64rem']

/**
 * Holds which optional Projects table columns are shown. The table is server-rendered with every column; this
 * wrapper marks the hidden ones, so a saved choice applies on first paint and toggling never refetches.
 */
export function ProjectColumns({ initial, children }: { initial: OptionalProjectColumn[]; children: ReactNode }) {
  const [shown, setShown] = useState<readonly OptionalProjectColumn[]>(initial)

  const toggle = useCallback(
    (column: OptionalProjectColumn, show: boolean) => {
      const others = shown.filter((c) => c !== column)
      const next = show ? [...others, column] : others
      setShown(next)
      document.cookie = `${PROJECT_COLUMNS_COOKIE}=${serializeProjectColumns(next)}; path=/; max-age=31536000; samesite=lax`
    },
    [shown],
  )
  const value = useMemo(() => ({ shown, toggle }), [shown, toggle])

  return (
    <ProjectColumnsContext.Provider value={value}>
      <div
        className="group/cols"
        data-hide-progress={shown.includes('progress') ? undefined : ''}
        data-hide-manager={shown.includes('manager') ? undefined : ''}
        style={{ '--project-table-min': TABLE_MIN_WIDTH[shown.length] } as CSSProperties}
      >
        {children}
      </div>
    </ProjectColumnsContext.Provider>
  )
}

/** Shown beside Sort while the table view is active; cards have no columns to choose. */
export function ProjectColumnsMenu() {
  const columns = useContext(ProjectColumnsContext)
  if (!columns) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" size="lg" className="bg-card group-data-[view=cards]/views:hidden" />}
      >
        <Columns3 data-icon="inline-start" />
        Columns
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Optional columns</DropdownMenuLabel>
          {OPTIONAL_PROJECT_COLUMNS.map((column) => (
            <DropdownMenuCheckboxItem
              key={column.key}
              checked={columns.shown.includes(column.key)}
              onCheckedChange={(checked) => columns.toggle(column.key, checked)}
            >
              {column.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
