import Link from 'next/link'
import { sectionTabClass, sectionTabListClass, sectionTabStripClass } from '@/components/shared/worksheet-tabs'

export function SubcontractsNav({ projectId, active }: { projectId: string; active: 'quotes' | 'work' }) {
  const base = `/projects/${projectId}/subcontractor-work`
  const items = [
    { key: 'quotes', label: 'Quotes', href: `${base}/quotes` },
    { key: 'work', label: 'Work verification', href: base },
  ] as const
  return (
    <nav aria-label="Sub work sections" className={sectionTabStripClass}>
      <ul className={sectionTabListClass}>
        {items.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              scroll={false}
              aria-current={active === item.key ? 'page' : undefined}
              className={sectionTabClass(active === item.key)}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
