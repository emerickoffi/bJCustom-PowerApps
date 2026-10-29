import Link from 'next/link'
import { ArrowRight, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ClientStatusBadge } from '@/components/shared/status-badge'
import { fullName, preferenceLabel, type DirectoryContact } from '@/components/clients/client-card'
import type { ClientSummary } from '@/lib/queries'
import { DIRECTORY_TH_TEXT, DIRECTORY_THEAD_ROW } from '@/lib/directory-table-styles'

export type ClientTableRow = {
  client: ClientSummary
  primary: DirectoryContact | null
  projectCount: number
}

const TH = `${DIRECTORY_TH_TEXT} px-4 text-left align-middle`

export function ClientTable({
  rows,
  projectsFailed,
  canManageContacts,
}: {
  rows: ClientTableRow[]
  projectsFailed: boolean
  canManageContacts: boolean
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#E2E8E2] bg-card shadow-[0_1px_2px_rgba(16,59,39,0.04)]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] text-sm">
          <caption className="sr-only">Clients</caption>
          <thead className={DIRECTORY_THEAD_ROW}>
            <tr>
              <th scope="col" className={TH}>Client</th>
              <th scope="col" className={TH}>Location</th>
              <th scope="col" className={TH}>Primary contact</th>
              <th scope="col" className={`${TH} text-right`}>Projects</th>
              <th scope="col" className={TH}>Status</th>
              <th scope="col" className={`${TH} text-right`}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8E2]">
            {rows.map(({ client, primary, projectCount }) => {
              const href = `/clients/${client.id}`
              const name = `${client.first_name} ${client.last_name}`
              const location = [client.city, client.state].filter(Boolean).join(', ')
              const preference = preferenceLabel(primary?.preferred_communication)
              return (
                <tr key={client.id} className="transition-colors hover:bg-[#F8F7F3]/70">
                  <td className="px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#EAF0E9] font-serif text-xs font-semibold text-[#174D32] ring-1 ring-inset ring-[#174D32]/12"
                        aria-hidden="true"
                      >
                        {`${client.first_name.charAt(0)}${client.last_name.charAt(0)}`.toUpperCase()}
                      </span>
                      <div className="flex min-w-0 flex-col">
                        <Link href={href} className="truncate font-medium text-foreground hover:text-primary hover:underline">
                          {name}
                        </Link>
                        <span className="text-xs text-muted-foreground">{`Client #${client.client_number}`}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{location || 'Not recorded'}</td>
                  <td className="px-4 py-3">
                    {primary ? (
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-foreground">{fullName(primary)}</span>
                        {preference && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <MessageCircle className="size-3 shrink-0" aria-hidden="true" />
                            {preference}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">No contact added</span>
                    )}
                  </td>
                  <td className="tabular px-4 py-3 text-right font-medium text-foreground">
                    {projectsFailed ? <span className="text-muted-foreground">—</span> : projectCount}
                  </td>
                  <td className="px-4 py-3">
                    <ClientStatusBadge status={client.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {canManageContacts && (
                        <Button variant="ghost" size="sm" render={<Link href={`${href}#contacts`} />} nativeButton={false}>
                          Manage contacts
                        </Button>
                      )}
                      <Button variant="outline" size="sm" render={<Link href={href} aria-label={`View client ${name}`} />} nativeButton={false}>
                        View
                        <ArrowRight data-icon="inline-end" />
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
