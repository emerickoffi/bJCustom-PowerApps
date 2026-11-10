import Link from 'next/link'
import { ArrowRight, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RecordPreviewSurface, RecordPreviewTrigger } from '@/components/shared/record-preview'
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
/**
 * With the preview open beside it, the table gives up its lower-priority columns as its own width shrinks, instead
 * of squeezing every column. The preview shows the same details for the selected client.
 */
const PREVIEW_HIDE_LOCATION = 'xl:group-data-preview-open/preview:@max-[72rem]:hidden'
const PREVIEW_HIDE_ACTION = 'xl:group-data-preview-open/preview:@max-5xl:hidden'
const PREVIEW_HIDE_CONTACT = 'xl:group-data-preview-open/preview:@max-4xl:hidden'
const PREVIEW_HIDE_PROJECTS = 'xl:group-data-preview-open/preview:@max-2xl:hidden'

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
    <div className="overflow-hidden rounded-xl border border-[#D6DDE5] bg-card shadow-[0_1px_2px_rgba(16,59,39,0.04)]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] text-sm xl:group-data-preview-open/preview:@max-[88rem]:min-w-0">
          <caption className="sr-only">Clients</caption>
          <thead className={DIRECTORY_THEAD_ROW}>
            <tr>
              <th scope="col" className={TH}>Client</th>
              <th scope="col" className={`${TH} ${PREVIEW_HIDE_LOCATION}`}>Location</th>
              <th scope="col" className={`${TH} ${PREVIEW_HIDE_CONTACT}`}>Primary contact</th>
              <th scope="col" className={`${TH} text-right ${PREVIEW_HIDE_PROJECTS}`}>Projects</th>
              <th scope="col" className={TH}>Status</th>
              <th scope="col" className={`${TH} text-right ${PREVIEW_HIDE_ACTION}`}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#D6DDE5]">
            {rows.map(({ client, primary, projectCount }) => {
              const href = `/clients/${client.id}`
              const name = `${client.first_name} ${client.last_name}`
              const location = [client.city, client.state].filter(Boolean).join(', ')
              const preference = preferenceLabel(primary?.preferred_communication)
              return (
                <RecordPreviewSurface
                  key={client.id}
                  as="tr"
                  recordId={client.id}
                  className="scroll-mt-24 scroll-mb-4 transition-colors hover:bg-link-soft/60 data-selected:bg-link-soft"
                >
                  <td className="px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-interactive-soft font-serif text-xs font-semibold text-primary ring-1 ring-inset ring-primary/12"
                        aria-hidden="true"
                      >
                        {`${client.first_name.charAt(0)}${client.last_name.charAt(0)}`.toUpperCase()}
                      </span>
                      <div className="flex min-w-0 flex-col">
                        <RecordPreviewTrigger
                          recordId={client.id}
                          name={name}
                          className="max-w-full self-start font-medium text-link hover:text-link-hover hover:underline"
                          labelClassName="block truncate"
                        />
                        <span className="text-xs text-muted-foreground">{`Client #${client.client_number}`}</span>
                      </div>
                    </div>
                  </td>
                  <td className={`px-4 py-3 text-muted-foreground ${PREVIEW_HIDE_LOCATION}`}>{location || 'Not recorded'}</td>
                  <td className={`px-4 py-3 ${PREVIEW_HIDE_CONTACT}`}>
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
                  <td className={`tabular px-4 py-3 text-right font-medium text-foreground ${PREVIEW_HIDE_PROJECTS}`}>
                    {projectsFailed ? <span className="text-muted-foreground">—</span> : projectCount}
                  </td>
                  <td className="px-4 py-3">
                    <ClientStatusBadge status={client.status} />
                  </td>
                  <td className={`px-4 py-3 ${PREVIEW_HIDE_ACTION}`}>
                    <div className="flex items-center justify-end gap-1">
                      {canManageContacts && (
                        <Button variant="ghost" size="sm" render={<Link href={`${href}#contacts`} />} nativeButton={false}>
                          Manage contacts
                        </Button>
                      )}
                      <Button variant="view" size="sm" render={<Link href={href} aria-label={`View client ${name}`} />} nativeButton={false}>
                        View
                        <ArrowRight data-icon="inline-end" />
                      </Button>
                    </div>
                  </td>
                </RecordPreviewSurface>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
