'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, FilePlus2, FolderPlus, Receipt, UserRoundPlus, type LucideIcon } from 'lucide-react'
import { FormOverlay } from '@/components/shared/form-overlay'

const ICONS = {
  client: UserRoundPlus,
  estimate: FilePlus2,
  invoice: Receipt,
  project: FolderPlus,
  company: Building2,
} satisfies Record<string, LucideIcon>

/**
 * Right-side drawer for an intercepted create route. The page underneath keeps its filters, search, and
 * scroll; Back or Cancel returns to it; a successful save follows the action's redirect; and a refresh of
 * the URL opens the full-page form instead.
 */
export function RouteFormDrawer({
  kind,
  title,
  description,
  size = 'lg',
  children,
}: {
  kind: keyof typeof ICONS
  title: string
  description: string
  size?: 'lg' | 'xl'
  children: React.ReactNode
}) {
  const router = useRouter()
  const close = useCallback(() => router.back(), [router])

  return (
    <FormOverlay open onClose={close} variant="drawer" size={size} icon={ICONS[kind]} title={title} description={description}>
      {children}
    </FormOverlay>
  )
}
