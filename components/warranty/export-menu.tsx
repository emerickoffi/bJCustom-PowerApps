'use client'

import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export const WARRANTY_REPORTS = [
  { key: 'open-claims', label: 'Open claims' },
  { key: 'stalled-claims', label: 'Claims past response target' },
  { key: 'expiring', label: 'Coverage expiring in 30 days' },
  { key: 'homes', label: 'Homes under warranty' },
] as const

export function WarrantyExportMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        <Download data-icon="inline-start" />
        Export
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Download CSV report</DropdownMenuLabel>
          {WARRANTY_REPORTS.map((r) => (
            <DropdownMenuItem key={r.key} render={<a href={`/warranty/export?report=${r.key}`} download />}>
              {r.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
