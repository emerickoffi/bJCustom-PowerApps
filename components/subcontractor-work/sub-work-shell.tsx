import { ClipboardCheck } from 'lucide-react'
import { PageHeader, pageLayout } from '@/components/shared/page-header'
import { SubcontractsNav, type SubWorkSection } from '@/components/subcontract-quotes/subcontracts-nav'

/** Shared frame for the Sub work sections: one stable heading, compact section tabs, and the content they open onto. */
export function SubWorkShell({
  projectId,
  active,
  count,
  actions,
  children,
}: {
  projectId: string
  active: SubWorkSection
  count?: React.ComponentProps<typeof PageHeader>['count']
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className={pageLayout('workspace', 'gap-3 md:gap-3')}>
      <PageHeader icon={ClipboardCheck} title="Subcontractor work" count={count} actions={actions} />
      <div className="flex min-w-0 flex-col">
        <SubcontractsNav projectId={projectId} active={active} />
        <div className="flex min-w-0 flex-col gap-4 pt-3">{children}</div>
      </div>
    </div>
  )
}
