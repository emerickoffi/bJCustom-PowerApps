'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CircleCheck, CircleOff, Eye, MoreHorizontal, Pencil } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SubcontractorStatusDialog } from '@/components/subcontractors/subcontractor-status-dialog'
import type { SubcontractorStatus } from '@/lib/subcontractors'

export function SubcontractorRowActions({
  companyId,
  companyName,
  status,
  includeNavigation = true,
}: {
  companyId: string
  companyName: string
  status: SubcontractorStatus
  includeNavigation?: boolean
}) {
  const [statusOpen, setStatusOpen] = useState(false)
  const active = status === 'active'

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Actions for ${companyName}`}
          className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-popup-open:bg-muted data-popup-open:text-foreground md:size-8"
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48 p-1">
          {includeNavigation && (
            <>
              <DropdownMenuItem render={<Link href={`/subcontractors/${companyId}`} />} className="min-h-10 gap-2.5 px-2.5 md:min-h-8">
                <Eye aria-hidden="true" />
                View details
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link href={`/subcontractors/${companyId}/edit`} />} className="min-h-10 gap-2.5 px-2.5 md:min-h-8">
                <Pencil aria-hidden="true" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem
            variant={active ? 'destructive' : 'default'}
            onClick={() => setStatusOpen(true)}
            className="min-h-10 gap-2.5 px-2.5 md:min-h-8"
          >
            {active ? <CircleOff aria-hidden="true" /> : <CircleCheck aria-hidden="true" />}
            {active ? 'Deactivate' : 'Reactivate'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <SubcontractorStatusDialog
        companyId={companyId}
        companyName={companyName}
        status={status}
        open={statusOpen}
        onOpenChange={setStatusOpen}
      />
    </>
  )
}
