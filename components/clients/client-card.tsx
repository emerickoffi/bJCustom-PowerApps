import Link from 'next/link'
import { ArrowRight, Mail, MapPin, Phone, UserRound, UsersRound } from 'lucide-react'
import { ClientProjectsDisclosure, type ClientProject } from '@/components/clients/client-projects-disclosure'
import { Button } from '@/components/ui/button'
import { ClientStatusBadge } from '@/components/shared/status-badge'
import { COMMUNICATION_LABELS, CONTACT_RELATIONSHIP_LABELS } from '@/lib/domain'
import type { ClientSummary } from '@/lib/queries'
import { cn } from '@/lib/utils'

export type DirectoryContact = {
  id: string
  client_id: string
  first_name: string
  middle_name: string | null
  last_name: string
  relationship: string
  email: string | null
  phone: string | null
  preferred_communication: string | null
  is_primary: boolean
}

function fullName(c: { first_name: string; middle_name?: string | null; last_name: string }) {
  return [c.first_name, c.middle_name, c.last_name].filter(Boolean).join(' ')
}

function ContactLines({ email, phone }: { email: string | null; phone: string | null }) {
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
        <Mail className="size-4 shrink-0 text-primary/70" aria-hidden="true" />
        <span className="sr-only">Email:</span>
        {email ? (
          <a href={`mailto:${email}`} className="min-w-0 break-all text-foreground hover:text-primary hover:underline">
            {email}
          </a>
        ) : (
          <span>No email on file</span>
        )}
      </span>
      <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
        <Phone className="size-4 shrink-0 text-primary/70" aria-hidden="true" />
        <span className="sr-only">Telephone:</span>
        {phone ? (
          <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className="text-foreground hover:text-primary hover:underline">
            {phone}
          </a>
        ) : (
          <span>No phone on file</span>
        )}
      </span>
    </div>
  )
}

function ContactColumn({
  label,
  icon: Icon,
  name,
  meta,
  email,
  phone,
  empty,
}: {
  label: string
  icon: typeof UserRound
  name?: string
  meta?: string | null
  email?: string | null
  phone?: string | null
  empty?: string
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col rounded-lg border p-4',
        empty ? 'gap-1.5 border-dashed border-[#D5DED5] bg-transparent' : 'gap-3 border-[#E2E8E2] bg-[#F8F7F3]',
      )}
    >
      <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[#64756D]">
        <Icon className="size-3.5 text-[#174D32]/70" aria-hidden="true" />
        {label}
      </span>
      {empty ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate font-medium text-foreground">{name}</span>
            {meta && <span className="text-xs text-muted-foreground">{meta}</span>}
          </div>
          <ContactLines email={email ?? null} phone={phone ?? null} />
        </>
      )}
    </div>
  )
}

export function ClientCard({
  client,
  primary,
  secondary,
  projects,
  projectsFailed = false,
  canManageContacts,
}: {
  client: ClientSummary
  primary: DirectoryContact | null
  secondary: DirectoryContact | null
  projects: ClientProject[]
  projectsFailed?: boolean
  canManageContacts: boolean
}) {
  const href = `/clients/${client.id}`
  const displayName = `${client.first_name} ${client.last_name}`
  const location = [client.city, client.state].filter(Boolean).join(', ')
  const preferred = primary?.preferred_communication
    ? (COMMUNICATION_LABELS as Record<string, string>)[primary.preferred_communication]
    : null

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-[#E2E8E2] bg-card shadow-[0_1px_2px_rgba(16,59,39,0.04)] transition-[box-shadow,border-color] hover:border-[#D5DED5] hover:shadow-[0_4px_14px_rgba(16,59,39,0.07)]">
      <header className="flex items-center justify-between gap-3 p-4 pb-3 sm:flex-wrap sm:p-5 sm:pb-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#EAF0E9] font-serif text-sm font-semibold text-[#174D32] ring-1 ring-inset ring-[#174D32]/12"
            aria-hidden="true"
          >
            {`${client.first_name.charAt(0)}${client.last_name.charAt(0)}`.toUpperCase()}
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="break-words text-base font-semibold text-foreground sm:truncate">
              <Link href={href} className="hover:text-primary hover:underline">
                {displayName}
              </Link>
            </h2>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              <span>{`Client #${client.client_number}`}</span>
              {client.company_name && <span>{client.company_name}</span>}
              {location && (
                <span className="flex items-center gap-1">
                  <MapPin className="size-3" aria-hidden="true" />
                  {location}
                </span>
              )}
            </span>
          </div>
        </div>
        <ClientStatusBadge status={client.status} />
      </header>

      <div className="flex flex-col gap-2 px-4 pb-4 sm:hidden">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground">
            <UserRound className="size-4 shrink-0 text-primary/70" aria-hidden="true" />
            <span className="sr-only">Primary contact:</span>
            <span className="min-w-0 break-words">{primary ? fullName(primary) : displayName}</span>
          </span>
          <ContactLines email={primary ? primary.email : client.email} phone={primary ? primary.phone : client.phone} />
        </div>
        <details className="group rounded-lg border border-border/70 bg-background/60">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
            {secondary ? 'All contacts (2)' : 'All contacts'}
            <ArrowRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden="true" />
          </summary>
          <div className="flex flex-col gap-3 border-t border-border/70 p-3">
            <ContactColumn
              label="Primary contact"
              icon={UserRound}
              name={primary ? fullName(primary) : displayName}
              meta={preferred ? `Prefers ${preferred.toLowerCase()}` : null}
              email={primary ? primary.email : client.email}
              phone={primary ? primary.phone : client.phone}
            />
            {secondary ? (
              <ContactColumn
                label="Secondary contact"
                icon={UsersRound}
                name={fullName(secondary)}
                meta={CONTACT_RELATIONSHIP_LABELS[secondary.relationship] ?? null}
                email={secondary.email}
                phone={secondary.phone}
              />
            ) : (
              <ContactColumn label="Secondary contact" icon={UsersRound} empty="Secondary contact not added" />
            )}
          </div>
        </details>
      </div>

      <div className="hidden gap-3 px-5 pb-5 sm:grid sm:grid-cols-2">
        <ContactColumn
          label="Primary contact"
          icon={UserRound}
          name={primary ? fullName(primary) : displayName}
          meta={preferred ? `Prefers ${preferred.toLowerCase()}` : null}
          email={primary ? primary.email : client.email}
          phone={primary ? primary.phone : client.phone}
        />
        {secondary ? (
          <ContactColumn
            label="Secondary contact"
            icon={UsersRound}
            name={fullName(secondary)}
            meta={CONTACT_RELATIONSHIP_LABELS[secondary.relationship] ?? null}
            email={secondary.email}
            phone={secondary.phone}
          />
        ) : (
          <ContactColumn label="Secondary contact" icon={UsersRound} empty="Secondary contact not added" />
        )}
      </div>

      <ClientProjectsDisclosure clientName={displayName} projects={projects} failed={projectsFailed}>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
          {canManageContacts && (
            <Button variant="ghost" size="sm" className="h-11 sm:h-8" render={<Link href={`${href}#contacts`} />} nativeButton={false}>
              Manage contacts
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className={canManageContacts ? 'h-11 sm:h-8' : 'col-span-2 h-11 sm:h-8'}
            render={<Link href={href} />}
            nativeButton={false}
          >
            View client
            <ArrowRight data-icon="inline-end" />
          </Button>
        </div>
      </ClientProjectsDisclosure>
    </article>
  )
}
