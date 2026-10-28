import { Check, CircleDot, CircleHelp, Minus } from 'lucide-react'
import type { OrgRole } from '@/lib/domain'
import type { FeatureMap } from '@/lib/feature-registry'
import type { Access, Cell, MatrixAction, MatrixModule } from '@/lib/permissions-matrix'

export const ACCESS_META: Record<Access, { label: string; icon: typeof Check; className: string }> = {
  allowed: { label: 'Allowed', icon: Check, className: 'bg-[#EAF0E9] text-[#174D32]' },
  conditional: { label: 'Conditional', icon: CircleDot, className: 'bg-[#E8F0F8] text-[#285A86]' },
  denied: { label: 'Not allowed', icon: Minus, className: 'bg-[#F4F4F1] text-[#8A948E]' },
  unverified: { label: 'Unverified', icon: CircleHelp, className: 'bg-[#FFF2DA] text-[#96570E]' },
}

export function effectiveCell(mod: MatrixModule, row: MatrixAction, role: OrgRole, features: FeatureMap): Cell {
  if (mod.feature && !features[mod.feature]) {
    return row.whenOff?.[role] ?? { state: 'denied', why: `${mod.module} is turned off in Feature management, so nobody can use it.` }
  }
  return row.access[role]
}

export function AccessBadge({ access }: { access: Access }) {
  const meta = ACCESS_META[access]
  return (
    <span className={`inline-flex size-7 shrink-0 items-center justify-center rounded-full ${meta.className}`}>
      <meta.icon className="size-3.5" aria-hidden="true" />
    </span>
  )
}
