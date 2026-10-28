import { Check, Eye, Minus, CircleHelp } from 'lucide-react'
import { ROLE_LABELS } from '@/lib/domain'
import type { FeatureMap } from '@/lib/feature-registry'
import { MATRIX_ROLES, PERMISSIONS_MATRIX, type Access } from '@/lib/permissions-matrix'

const ACCESS_META: Record<Access, { label: string; icon: typeof Check; className: string }> = {
  allowed: { label: 'Allowed', icon: Check, className: 'bg-[#EAF0E9] text-[#174D32]' },
  shared_only: { label: 'Granted projects only', icon: Eye, className: 'bg-[#E8F0F8] text-[#285A86]' },
  denied: { label: 'Not allowed', icon: Minus, className: 'bg-[#F4F4F1] text-[#8A948E]' },
  review: { label: 'Allowed · scoping not verified', icon: CircleHelp, className: 'bg-[#FFF2DA] text-[#96570E]' },
}

function AccessCell({ access }: { access: Access }) {
  const meta = ACCESS_META[access]
  return (
    <span
      className={`inline-flex size-7 items-center justify-center rounded-full ${meta.className}`}
      title={meta.label}
    >
      <meta.icon className="size-3.5" aria-hidden="true" />
      <span className="sr-only">{meta.label}</span>
    </span>
  )
}

export function PermissionsMatrix({ features }: { features: FeatureMap }) {
  return (
    <div className="flex flex-col gap-6">
      <ul aria-label="Legend" className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-[#64756D]">
        {(Object.keys(ACCESS_META) as Access[]).map((key) => (
          <li key={key} className="flex items-center gap-2">
            <AccessCell access={key} />
            {ACCESS_META[key].label}
          </li>
        ))}
      </ul>

      <div className="overflow-x-auto rounded-xl border border-[#E2E8E2] bg-card shadow-[0_1px_2px_rgba(16,59,39,0.04)]">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <caption className="sr-only">Effective permissions by role, module, and action</caption>
          <thead>
            <tr className="border-b border-[#E2E8E2] bg-[#F8F7F3] text-left">
              <th scope="col" className="px-4 py-3 font-medium text-[#64756D]">
                Module / action
              </th>
              {MATRIX_ROLES.map((role) => (
                <th key={role} scope="col" className="w-36 px-3 py-3 text-center font-medium text-[#174D32]">
                  {ROLE_LABELS[role]}
                </th>
              ))}
            </tr>
          </thead>
          {PERMISSIONS_MATRIX.map((mod) => {
            const off = mod.feature ? !features[mod.feature] : false
            return (
              <tbody key={mod.module} className="border-b border-[#E2E8E2] last:border-b-0">
                <tr className="bg-white">
                  <th scope="rowgroup" colSpan={MATRIX_ROLES.length + 1} className="px-4 pb-1 pt-4 text-left">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-serif text-base font-semibold text-foreground">{mod.module}</span>
                      {off && (
                        <span className="rounded-full bg-[#F4F4F1] px-2 py-0.5 text-xs font-medium text-[#64756D]">
                          Turned off for your company
                        </span>
                      )}
                      <code className="text-xs font-normal text-[#8A948E]">{mod.guard}</code>
                    </span>
                  </th>
                </tr>
                {mod.actions.map((row) => (
                  <tr key={row.action} className={off ? 'opacity-60' : undefined}>
                    <th scope="row" className="px-4 py-2 text-left font-normal text-foreground">
                      <span className="block pl-3">{row.action}</span>
                      {row.note && <span className="block pl-3 text-xs text-[#64756D]">{row.note}</span>}
                    </th>
                    {MATRIX_ROLES.map((role) => (
                      <td key={role} className="px-3 py-2 text-center">
                        <AccessCell access={off ? 'denied' : row.access[role]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            )
          })}
        </table>
      </div>

      <p className="text-xs text-[#64756D]">
        This view can&apos;t be edited. Roles are assigned in Users &amp; Access. Cells marked &quot;scoping not
        verified&quot; mean the server lets that role in, but limits to assigned projects haven&apos;t been confirmed
        at the database level yet.
      </p>
    </div>
  )
}
