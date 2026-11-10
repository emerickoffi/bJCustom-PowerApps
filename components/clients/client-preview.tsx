'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { ArrowRight, Pencil, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ActiveStatusBadge, SemanticBadge, type SemanticTone } from '@/components/shared/semantic-badge'
import { ProjectStatusBadge } from '@/components/shared/status-badge'
import {
  PREVIEW_LINK_CLASS,
  PreviewEmpty,
  PreviewList,
  PreviewNotes,
  PreviewRecordLink,
  PreviewSection,
  PreviewSectionError,
  PreviewShortcuts,
  RecordPreviewBody,
  RecordPreviewHeader,
  RecordPreviewLayout,
} from '@/components/shared/record-preview'
import {
  CLIENT_EDIT_PARAM,
  CLIENT_PORTAL_LABELS,
  CLIENT_PREVIEW_PANEL_ID,
  CLIENT_PREVIEW_PARAM,
  PREVIEW_LIST_LIMIT,
  clientPreviewApiPath,
  recordPreviewErrorState,
  type ClientPortal,
  type ClientPortalStatus,
  type ClientPreview as ClientPreviewData,
  type ClientPreviewContact,
} from '@/lib/record-preview'

export type ClientPreviewRecord = { id: string; name: string; number: number }

/** The Clients list with its on-demand preview. `editing` is set while the edit drawer covers the list. */
export function ClientPreviewLayout({
  clients,
  canManage,
  editing,
  children,
}: {
  clients: ClientPreviewRecord[]
  canManage: boolean
  editing: boolean
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const editHref = (clientId: string) => {
    const params = new URLSearchParams(searchParams.toString())
    // The preview opens before the router has caught up with the URL, so the link names the previewed client itself.
    params.set(CLIENT_PREVIEW_PARAM, clientId)
    params.set(CLIENT_EDIT_PARAM, clientId)
    return `${pathname}?${params.toString()}`
  }

  return (
    <RecordPreviewLayout
      records={clients}
      param={CLIENT_PREVIEW_PARAM}
      panelId={CLIENT_PREVIEW_PANEL_ID}
      label="Client preview"
      suspended={editing}
      renderPreview={(client) => <ClientPreview client={client} editHref={canManage ? editHref(client.id) : null} />}
    >
      {children}
    </RecordPreviewLayout>
  )
}

function ClientPreview({ client, editHref }: { client: ClientPreviewRecord; editHref: string | null }) {
  return (
    <>
      <RecordPreviewHeader
        title={client.name}
        closeLabel="Close client preview"
        meta={<span className="text-xs text-muted-foreground">{`Client #${client.number}`}</span>}
        actions={
          <>
            {editHref && (
              <Button variant="outline" size="sm" render={<Link href={editHref} scroll={false} replace />} nativeButton={false}>
                <Pencil data-icon="inline-start" />
                Edit
              </Button>
            )}
            <Button variant="view" size="sm" render={<Link href={`/clients/${client.id}`} />} nativeButton={false}>
              Open client
              <ArrowRight data-icon="inline-end" />
            </Button>
          </>
        }
      />
      <RecordPreviewBody<ClientPreviewData>
        url={clientPreviewApiPath(client.id)}
        recordId={client.id}
        loadingLabel="Loading client details"
        errorState={(status) => recordPreviewErrorState(status, 'client')}
      >
        {(preview) => <ClientDetails preview={preview} />}
      </RecordPreviewBody>
    </>
  )
}

function ContactRow({ label, contact }: { label: string; contact: ClientPreviewContact }) {
  const detail = [contact.relationship, contact.preference].filter(Boolean).join(' · ')
  return (
    <li className="flex min-w-0 items-center gap-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="break-words text-sm font-medium text-foreground">{contact.name}</span>
        {detail && <span className="break-words text-xs text-muted-foreground">{detail}</span>}
        {!contact.phone && !contact.email && <span className="text-xs text-muted-foreground">No phone or email on file</span>}
      </div>
      <PreviewShortcuts name={contact.name} phone={contact.phone} email={contact.email} />
    </li>
  )
}

function ClientDetails({ preview }: { preview: ClientPreviewData }) {
  const { contacts, projects } = preview

  return (
    <>
      <PreviewSection
        title="Contacts"
        action={
          contacts.state === 'ready' &&
          contacts.otherCount > 0 && (
            <Link href={preview.contactsHref} className={PREVIEW_LINK_CLASS}>
              {`View all (${contacts.otherCount + 2})`}
            </Link>
          )
        }
      >
        {contacts.state === 'error' ? (
          <PreviewSectionError>Contacts could not be loaded.</PreviewSectionError>
        ) : (
          <ul className="flex flex-col gap-2.5">
            <ContactRow label="Primary contact" contact={contacts.primary} />
            {contacts.secondary && <ContactRow label="Secondary contact" contact={contacts.secondary} />}
          </ul>
        )}
      </PreviewSection>

      <PreviewSection
        title="Projects"
        count={projects.state === 'ready' ? projects.items.length : undefined}
        action={
          preview.createProjectHref && (
            <Button variant="outline" size="sm" render={<Link href={preview.createProjectHref} />} nativeButton={false}>
              <Plus data-icon="inline-start" />
              Create project
            </Button>
          )
        }
      >
        {projects.state === 'error' ? (
          <PreviewSectionError>Projects could not be loaded.</PreviewSectionError>
        ) : projects.items.length === 0 ? (
          <PreviewEmpty>No projects linked to this client.</PreviewEmpty>
        ) : (
          <PreviewList items={projects.items} limit={PREVIEW_LIST_LIMIT} itemKey={(p) => p.id}>
            {(p) => (
              <>
                <PreviewRecordLink href={p.href} name={p.name} detail={p.number} />
                <ProjectStatusBadge status={p.status} className="shrink-0" />
              </>
            )}
          </PreviewList>
        )}
      </PreviewSection>

      <PortalSection portal={preview.portal} />
      <PreviewNotes notes={preview.notes} />
    </>
  )
}

const PORTAL_TONE: Record<Exclude<ClientPortalStatus, 'active'>, SemanticTone> = {
  not_provisioned: 'neutral',
  invited: 'pending',
  pending: 'pending',
  suspended: 'danger',
  portal_off: 'neutral',
}

/** Reports the access that exists. Granting or inviting happens only on the client's own page. */
function PortalSection({ portal }: { portal: ClientPortal }) {
  if (portal.state === 'hidden') return null
  if (portal.state !== 'ready') {
    return (
      <PreviewSection title="Portal access">
        <PreviewSectionError>Portal access could not be loaded.</PreviewSectionError>
      </PreviewSection>
    )
  }
  return (
    <PreviewSection
      title="Portal access"
      action={
        <Link href={portal.manageHref} className={PREVIEW_LINK_CLASS}>
          Manage access
        </Link>
      }
    >
      <div className="flex flex-col items-start gap-1.5">
        {portal.status === 'active' ? (
          <ActiveStatusBadge />
        ) : (
          <SemanticBadge tone={PORTAL_TONE[portal.status]}>{CLIENT_PORTAL_LABELS[portal.status]}</SemanticBadge>
        )}
        {portal.detail && <p className="text-sm text-muted-foreground">{portal.detail}</p>}
      </div>
    </PreviewSection>
  )
}
