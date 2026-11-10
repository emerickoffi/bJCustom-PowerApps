import { WorksheetFilters } from '@/components/shared/worksheet-filters'

export type SubWorkSection = 'quotes' | 'work'

export function SubcontractsNav({ projectId, active }: { projectId: string; active: SubWorkSection }) {
  const base = `/projects/${projectId}/subcontractor-work`
  return (
    <WorksheetFilters
      label="Sub work sections"
      size="compact"
      current="page"
      filters={[
        { key: 'quotes', label: 'Quotes', href: `${base}/quotes`, active: active === 'quotes' },
        { key: 'work', label: 'Work verification', href: base, active: active === 'work' },
      ]}
    />
  )
}
