'use client'

import { useId, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight, CircleAlert, FolderKanban, House } from 'lucide-react'
import { ProjectStatusBadge } from '@/components/shared/status-badge'
import type { ProjectStatus } from '@/lib/domain'
import { cn } from '@/lib/utils'

export type ClientProject = {
  id: string
  name: string
  project_number: string | null
  status: ProjectStatus
}

export function ClientProjectsDisclosure({
  clientName,
  projects,
  failed = false,
  children,
}: {
  clientName: string
  projects: ClientProject[]
  failed?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const listId = useId()
  const count = projects.length
  const label = count === 1 ? '1 project' : `${count} projects`

  return (
    <div className="mt-auto flex flex-col">
      {count > 0 && (
        <div
          id={listId}
          inert={!open}
          className={cn(
            'grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none',
            open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
          )}
        >
          <div className="overflow-hidden">
            <ul
              aria-label={`Projects for ${clientName}`}
              className="flex flex-col divide-y divide-[#E2E8E2]/80 border-t border-[#E2E8E2] bg-[#FBFCFA]"
            >
              {projects.map((project) => (
                <li key={project.id}>
                  <Link
                    href={`/projects/${project.id}`}
                    className="group flex min-h-12 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[#EAF0E9]/60 focus-visible:bg-[#EAF0E9]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#174D32]/40 sm:px-5"
                  >
                    <House className="size-4 shrink-0 text-[#174D32]/60" aria-hidden="true" />
                    <span className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium text-foreground group-hover:text-[#174D32]">
                          {project.name}
                        </span>
                        {project.project_number && (
                          <span className="text-xs text-[#64756D]">{project.project_number}</span>
                        )}
                      </span>
                      <ProjectStatusBadge status={project.status} className="self-start sm:self-auto" />
                    </span>
                    <ChevronRight
                      className="size-4 shrink-0 text-[#64756D] transition-transform group-hover:translate-x-0.5 group-hover:text-[#174D32]"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E2E8E2] bg-[#F8F7F3]/70 px-4 py-3 sm:gap-3 sm:px-5">
        {failed ? (
          <span role="alert" className="flex items-center gap-1.5 text-sm text-destructive">
            <CircleAlert className="size-4" aria-hidden="true" />
            Projects couldn&apos;t be loaded
          </span>
        ) : count > 0 ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => setOpen((v) => !v)}
            className="-ml-2 flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm text-[#64756D] transition-colors hover:bg-[#EAF0E9] hover:text-[#174D32] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#174D32]/40 sm:min-h-8"
          >
            <FolderKanban className="size-4 text-[#174D32]/70" aria-hidden="true" />
            {label}
            <ChevronDown
              className={cn('size-4 transition-transform motion-reduce:transition-none', open && 'rotate-180')}
              aria-hidden="true"
            />
          </button>
        ) : (
          <span className="flex items-center gap-1.5 text-sm text-[#64756D]">
            <FolderKanban className="size-4 text-[#174D32]/70" aria-hidden="true" />
            No projects yet
          </span>
        )}
        {children}
      </footer>
    </div>
  )
}
