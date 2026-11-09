import Link from 'next/link'
import { cn } from '@/lib/utils'

export const DETAIL_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'qualification', label: 'Qualification' },
  { key: 'projects', label: 'Projects' },
  { key: 'history', label: 'History' },
] as const
export type DetailTab = (typeof DETAIL_TABS)[number]['key']

export function parseDetailTab(value: string | undefined): DetailTab {
  return DETAIL_TABS.some((t) => t.key === value) ? (value as DetailTab) : 'overview'
}

export function detailTabHref(companyId: string, tab: DetailTab) {
  return tab === 'overview' ? `/subcontractors/${companyId}` : `/subcontractors/${companyId}?tab=${tab}`
}

/** Link-based tabs: each tab is a real URL, so refresh, deep links, and back/forward keep the selected tab. */
export function DetailTabs({ companyId, active, counts }: { companyId: string; active: DetailTab; counts?: Partial<Record<DetailTab, number>> }) {
  return (
    // overflow-x forces overflow-y to auto, so the -mb-px underline overlap used to create a 1px vertical scroll.
    // The divider is an inset shadow on the list instead, and vertical overflow is clipped explicitly.
    <nav aria-label="Subcontractor sections" className="overflow-x-auto overflow-y-hidden [scrollbar-width:thin]">
      <ul className="flex min-w-max gap-1 shadow-[inset_0_-1px_0_var(--border)]">
        {DETAIL_TABS.map((t) => {
          const current = t.key === active
          const count = counts?.[t.key]
          return (
            <li key={t.key}>
              <Link
                href={detailTabHref(companyId, t.key)}
                scroll={false}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'flex min-h-11 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring',
                  current ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {t.label}
                {count ? (
                  <span className="rounded-badge bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">{count}</span>
                ) : null}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
