'use client'

import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function NewClaimMenu({ projects }: { projects: { id: string; name: string; number: string | null }[] }) {
  const router = useRouter()
  if (projects.length === 0) {
    return (
      <Button disabled title="No projects are under active warranty">
        <Plus data-icon="inline-start" />
        New warranty claim
      </Button>
    )
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button />}>
        <Plus data-icon="inline-start" />
        New warranty claim
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 w-72">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Choose a home under warranty</DropdownMenuLabel>
          {projects.map((p) => (
            <DropdownMenuItem key={p.id} onClick={() => router.push(`/projects/${p.id}/warranty?claim=new#claims`)}>
              <span className="truncate">{p.name}</span>
              {p.number && <span className="ml-auto shrink-0 text-xs text-muted-foreground">{p.number}</span>}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
