'use client'

import { Fragment, useMemo, useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { ROLE_LABELS, type OrgRole } from '@/lib/domain'
import type { FeatureMap } from '@/lib/feature-registry'
import { ACCESS_DEFINITIONS, MATRIX_ROLES, PERMISSIONS_MATRIX, type Access } from '@/lib/permissions-matrix'
import { Input } from '@/components/ui/input'
import { ACCESS_META, AccessBadge, effectiveCell } from '@/components/settings/access-badge'
import { RoleDetailSheet } from '@/components/settings/role-detail-sheet'

const STATE_ORDER: Access[] = ['allowed', 'conditional', 'denied', 'unverified']

type Selected = { rowKey: string; role: OrgRole }

export function PermissionsMatrix({ features }: { features: FeatureMap }) {
  const [query, setQuery] = useState('')
  const [stateFilter, setStateFilter] = useState<Access | 'all'>('all')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Selected | null>(null)
  const [detailRole, setDetailRole] = useState<OrgRole | null>(null)

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return PERMISSIONS_MATRIX.flatMap((mod) => {
      const moduleMatch = !q || mod.module.toLowerCase().includes(q)
      const actions = mod.actions.filter((row) => {
        const textMatch = moduleMatch || row.action.toLowerCase().includes(q)
        const stateMatch =
          stateFilter === 'all' || MATRIX_ROLES.some((role) => effectiveCell(mod, row, role, features).state === stateFilter)
        return textMatch && stateMatch
      })
      return actions.length ? [{ mod, actions }] : []
    })
  }, [query, stateFilter, features])

  const resultCount = visible.reduce((n, v) => n + v.actions.length, 0)
  const allCollapsed = visible.length > 0 && visible.every((v) => collapsed.has(v.mod.id))

  function toggleModule(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setCollapsed(allCollapsed ? new Set() : new Set(PERMISSIONS_MATRIX.map((m) => m.id)))
  }

  return (
    <div className="flex flex-col gap-6">
      <ul aria-label="Legend" className="grid gap-3 text-sm text-[#64756D] sm:grid-cols-2 lg:grid-cols-4">
        {STATE_ORDER.map((key) => (
          <li key={key} className="flex items-start gap-2.5">
            <AccessBadge access={key} />
            <span>
              <span className="block font-medium text-foreground">{ACCESS_META[key].label}</span>
              <span className="block text-xs leading-relaxed">{ACCESS_DEFINITIONS[key]}</span>
            </span>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8A948E]" aria-hidden="true" />
          <label htmlFor="permission-search" className="sr-only">
            Search permissions by module or action
          </label>
          <Input
            id="permission-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search module or action"
            className="border-[#E2E8E2] bg-white pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Filter by permission state" className="flex flex-wrap gap-1.5">
            {(['all', ...STATE_ORDER] as const).map((key) => {
              const active = stateFilter === key
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setStateFilter(key)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#174D32] ${
                    active
                      ? 'border-[#174D32] bg-[#174D32] text-white'
                      : 'border-[#E2E8E2] bg-white text-[#64756D] hover:bg-[#F8F7F3] hover:text-[#103B27]'
                  }`}
                >
                  {key === 'all' ? 'All states' : ACCESS_META[key].label}
                </button>
              )
            })}
          </div>
          <button
            type="button"
            onClick={toggleAll}
            className="rounded-full px-3 py-1 text-xs font-medium text-[#174D32] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#174D32]"
          >
            {allCollapsed ? 'Expand all' : 'Collapse all'}
          </button>
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {resultCount} {resultCount === 1 ? 'permission' : 'permissions'} shown
      </p>

      <div className="max-h-[75vh] overflow-auto rounded-xl border border-[#E2E8E2] bg-card shadow-[0_1px_2px_rgba(16,59,39,0.04)]">
        <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
          <caption className="sr-only">
            Effective permissions by role, module, and action. Select a cell to see its conditions.
          </caption>
          <thead>
            <tr className="text-left">
              <th
                scope="col"
                className="sticky left-0 top-0 z-30 border-b border-[#E2E8E2] bg-[#F8F7F3] px-4 py-3 font-medium text-[#64756D]"
              >
                Module / action
              </th>
              {MATRIX_ROLES.map((role) => (
                <th
                  key={role}
                  scope="col"
                  className="sticky top-0 z-20 w-32 border-b border-[#E2E8E2] bg-[#F8F7F3] px-2 py-3 text-center font-medium"
                >
                  <button
                    type="button"
                    onClick={() => setDetailRole(role)}
                    className="rounded-md px-2 py-1 text-[#174D32] underline decoration-[#174D32]/30 underline-offset-4 hover:decoration-[#174D32] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#174D32]"
                  >
                    {ROLE_LABELS[role]}
                    <span className="sr-only">: view role details</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          {visible.length === 0 && (
            <tbody>
              <tr>
                <td colSpan={MATRIX_ROLES.length + 1} className="px-4 py-10 text-center text-[#64756D]">
                  No permissions match your search and filter.
                </td>
              </tr>
            </tbody>
          )}
          {visible.map(({ mod, actions }) => {
            const off = mod.feature ? !features[mod.feature] : false
            const isCollapsed = collapsed.has(mod.id)
            const groupId = `perm-group-${mod.id}`
            return (
              <Fragment key={mod.id}>
                <tbody>
                  <tr>
                    <th
                      scope="rowgroup"
                      colSpan={MATRIX_ROLES.length + 1}
                      className="border-t border-[#E2E8E2] bg-white px-4 pb-1 pt-4 text-left first:border-t-0"
                    >
                      <div className="sticky left-4 flex max-w-[calc(100vw-5rem)] flex-col gap-1 sm:max-w-none">
                        <button
                          type="button"
                          aria-expanded={!isCollapsed}
                          aria-controls={groupId}
                          onClick={() => toggleModule(mod.id)}
                          className="flex w-fit items-center gap-2 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#174D32]"
                        >
                          <ChevronDown
                            className={`size-4 text-[#64756D] transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
                            aria-hidden="true"
                          />
                          <span className="font-serif text-base font-semibold text-foreground">{mod.module}</span>
                          <span className="text-xs font-normal text-[#8A948E]">
                            {actions.length} {actions.length === 1 ? 'action' : 'actions'}
                          </span>
                        </button>
                        <span className="flex flex-wrap items-center gap-2 pl-6 text-xs font-normal">
                          {off && (
                            <span className="rounded-full bg-[#F4F4F1] px-2 py-0.5 font-medium text-[#64756D]">
                              Turned off for your company
                            </span>
                          )}
                          <code className="text-[#8A948E]">{mod.guard}</code>
                          <span className="text-[#64756D]">{mod.database}</span>
                        </span>
                      </div>
                    </th>
                  </tr>
                </tbody>
                <tbody id={groupId} hidden={isCollapsed}>
                  {actions.map((row) => {
                    const rowKey = `${mod.id}:${row.action}`
                    const detailId = `perm-detail-${mod.id}-${mod.actions.indexOf(row)}`
                    const open = selected?.rowKey === rowKey ? selected : null
                    const openCell = open ? effectiveCell(mod, row, open.role, features) : null
                    return (
                      <Fragment key={rowKey}>
                        <tr className={off ? 'opacity-70' : undefined}>
                          <th
                            scope="row"
                            className="sticky left-0 z-10 bg-white px-4 py-2 text-left font-normal text-foreground"
                          >
                            <span className="block pl-6">{row.action}</span>
                          </th>
                          {MATRIX_ROLES.map((role) => {
                            const cell = effectiveCell(mod, row, role, features)
                            const meta = ACCESS_META[cell.state]
                            const isOpen = open?.role === role
                            const explanation = cell.why ?? ACCESS_DEFINITIONS[cell.state]
                            return (
                              <td key={role} className="px-2 py-2 text-center">
                                <button
                                  type="button"
                                  aria-expanded={isOpen}
                                  aria-controls={detailId}
                                  aria-label={`${ROLE_LABELS[role]}, ${row.action}: ${meta.label}. ${explanation}`}
                                  title={`${meta.label}: ${explanation}`}
                                  onClick={() => setSelected(isOpen ? null : { rowKey, role })}
                                  className={`inline-flex rounded-full p-0.5 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#174D32] ${
                                    isOpen ? 'ring-2 ring-[#174D32]/40' : 'hover:ring-2 hover:ring-[#E2E8E2]'
                                  }`}
                                >
                                  <AccessBadge access={cell.state} />
                                </button>
                              </td>
                            )
                          })}
                        </tr>
                        {open && openCell && (
                          <tr id={detailId}>
                            <td colSpan={MATRIX_ROLES.length + 1} className="px-4 pb-3">
                              <div className="sticky left-4 flex max-w-[calc(100vw-5rem)] items-start gap-3 rounded-lg border border-[#E2E8E2] bg-[#F8F7F3] p-3 text-left sm:max-w-none">
                                <AccessBadge access={openCell.state} />
                                <div className="flex flex-col gap-1">
                                  <p className="text-sm font-medium text-foreground">
                                    {ROLE_LABELS[open.role]} · {ACCESS_META[openCell.state].label}
                                  </p>
                                  {openCell.why && <p className="text-sm text-[#103B27]">{openCell.why}</p>}
                                  <p className="text-xs text-[#64756D]">{ACCESS_DEFINITIONS[openCell.state]}</p>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </Fragment>
            )
          })}
        </table>
      </div>

      <p className="text-xs text-[#64756D]">
        This view can&apos;t be edited. Roles are assigned in Users &amp; Access. Each cell reflects the server-side
        checks and the live database security policies. Select a cell or a role name for the exact conditions.
      </p>

      <RoleDetailSheet role={detailRole} features={features} onClose={() => setDetailRole(null)} />
    </div>
  )
}
