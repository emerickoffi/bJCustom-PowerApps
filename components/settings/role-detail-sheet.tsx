'use client'

import { ROLE_LABELS, type OrgRole } from '@/lib/domain'
import type { FeatureMap } from '@/lib/feature-registry'
import { PERMISSIONS_MATRIX, ROLE_DETAILS, type Access } from '@/lib/permissions-matrix'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ACCESS_META, AccessBadge, effectiveCell } from '@/components/settings/access-badge'

const LISTED: Access[] = ['allowed', 'conditional', 'unverified']

export function RoleDetailSheet({
  role,
  features,
  onClose,
}: {
  role: OrgRole | null
  features: FeatureMap
  onClose: () => void
}) {
  return (
    <Sheet open={role !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        {role && <RoleDetailBody role={role} features={features} />}
      </SheetContent>
    </Sheet>
  )
}

function RoleDetailBody({ role, features }: { role: OrgRole; features: FeatureMap }) {
  const detail = ROLE_DETAILS[role]
  const offModules = PERMISSIONS_MATRIX.filter((m) => m.feature && !features[m.feature])
  const groups = LISTED.map((state) => ({
    state,
    items: PERMISSIONS_MATRIX.flatMap((mod) =>
      mod.actions.flatMap((row) => {
        const cell = effectiveCell(mod, row, role, features)
        return cell.state === state ? [{ key: `${mod.id}:${row.action}`, label: `${mod.module} · ${row.action}`, why: cell.why }] : []
      }),
    ),
  }))

  return (
    <>
      <SheetHeader className="border-b border-[#E2E8E2] bg-[#F8F7F3] pr-12">
        <SheetTitle className="font-serif text-xl font-semibold text-[#103B27]">{ROLE_LABELS[role]}</SheetTitle>
        <SheetDescription>{detail.summary}</SheetDescription>
      </SheetHeader>

      <div className="flex flex-col gap-6 px-4 pb-6">
        <section aria-labelledby="role-scope" className="flex flex-col gap-1.5">
          <h3 id="role-scope" className="text-xs font-semibold uppercase tracking-wide text-[#64756D]">
            Record scope
          </h3>
          <p className="text-sm text-foreground">{detail.scope}</p>
        </section>

        {groups.map(({ state, items }) =>
          items.length === 0 ? null : (
            <section key={state} aria-labelledby={`role-${state}`} className="flex flex-col gap-2">
              <h3 id={`role-${state}`} className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#64756D]">
                <AccessBadge access={state} />
                {ACCESS_META[state].label} ({items.length})
              </h3>
              <ul className="flex flex-col gap-2">
                {items.map((item) => (
                  <li key={item.key} className="rounded-lg border border-[#E2E8E2] bg-white px-3 py-2">
                    <p className="text-sm font-medium text-foreground">{item.label}</p>
                    {item.why && <p className="mt-0.5 text-xs leading-relaxed text-[#64756D]">{item.why}</p>}
                  </li>
                ))}
              </ul>
            </section>
          ),
        )}

        <section aria-labelledby="role-features" className="flex flex-col gap-1.5">
          <h3 id="role-features" className="text-xs font-semibold uppercase tracking-wide text-[#64756D]">
            Feature restrictions
          </h3>
          <p className="text-sm text-foreground">
            {offModules.length
              ? `Turned off for your company, so unavailable to this role: ${offModules.map((m) => m.module).join(', ')}.`
              : 'Every module in this matrix is turned on for your company.'}
          </p>
        </section>

        <section aria-labelledby="role-gaps" className="flex flex-col gap-1.5">
          <h3 id="role-gaps" className="text-xs font-semibold uppercase tracking-wide text-[#64756D]">
            Known verification gaps
          </h3>
          {detail.gaps.length ? (
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-foreground">
              {detail.gaps.map((gap) => (
                <li key={gap}>{gap}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-foreground">None identified.</p>
          )}
        </section>
      </div>
    </>
  )
}
