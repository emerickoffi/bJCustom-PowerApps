'use client'

import { useParams } from 'next/navigation'
import { SubWorkShell } from '@/components/subcontractor-work/sub-work-shell'
import type { SubWorkSection } from '@/components/subcontract-quotes/subcontracts-nav'

export function SubWorkLoading({ active }: { active: SubWorkSection }) {
  const { id } = useParams<{ id: string }>()
  return (
    <SubWorkShell projectId={id} active={active}>
      <div role="status" aria-live="polite" className="flex flex-col gap-2">
        <span className="sr-only">{active === 'quotes' ? 'Loading quote requests' : 'Loading work submissions'}</span>
        {[0, 1, 2].map((i) => (
          <div key={i} aria-hidden="true" className="h-12 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    </SubWorkShell>
  )
}
