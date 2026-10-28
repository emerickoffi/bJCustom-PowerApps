import type { ComponentType, ReactNode } from 'react'
import {
  CalendarDays,
  ContactRound,
  FolderKanban,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  PhoneForwarded,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type IconType = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>

export type ClientInformation = {
  email: string | null
  phone: string | null
  alternatePhone: string | null
  preferredContact: string | null
  mailingAddress: string
  clientSince: string
  projectCount: number
  notes: string | null
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function telHref(phone: string) {
  const digits = phone.replace(/[^\d+]/g, '')
  return digits.replace(/\D/g, '').length >= 7 ? `tel:${digits}` : null
}

function Missing() {
  return <span className="font-normal text-muted-foreground">Not provided</span>
}

function Field({
  icon: Icon,
  label,
  children,
  className,
}: {
  icon: IconType
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex min-w-0 gap-3', className)}>
      <Icon className="mt-0.5 size-4 shrink-0 text-primary/70" aria-hidden />
      <div className="flex min-w-0 flex-col gap-0.5">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="break-words text-sm font-medium text-foreground">{children}</dd>
      </div>
    </div>
  )
}

function Group({ title, children, columns = true }: { title: string; children: ReactNode; columns?: boolean }) {
  return (
    <section className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      <dl className={cn('grid gap-x-6 gap-y-4', columns && 'sm:grid-cols-2')}>{children}</dl>
    </section>
  )
}

const linkClass =
  'rounded-sm text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export type ClientIdentity = {
  name: string
  initials: string
  company: string | null
  /** Extra `<li>` items shown before the project count, e.g. client number and status. */
  meta?: ReactNode
  actions?: ReactNode
}

export function ClientInformationCard({ info, identity }: { info: ClientInformation; identity: ClientIdentity }) {
  const phoneLink = info.phone ? telHref(info.phone) : null
  const altLink = info.alternatePhone ? telHref(info.alternatePhone) : null

  const projectLabel = `${info.projectCount} ${info.projectCount === 1 ? 'project' : 'projects'}`

  return (
    <section
      aria-labelledby="client-profile-heading"
      className="flex flex-col overflow-hidden rounded-xl border border-[#E2E8E2] bg-card shadow-xs"
    >
      <header className="flex flex-col gap-4 border-b border-[#E2E8E2] bg-[#EAF0E9] px-5 py-5 md:flex-row md:items-start md:justify-between md:px-6">
        <div className="flex min-w-0 items-start gap-4">
          <span
            aria-hidden="true"
            className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#174D32] font-serif text-base font-semibold text-white md:size-14 md:text-lg"
          >
            {identity.initials || <ContactRound className="size-5" aria-hidden />}
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#174D32]">Client profile</p>
            <h1
              id="client-profile-heading"
              className="text-balance break-words font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground md:text-3xl"
            >
              {identity.name}
            </h1>
            {identity.company && <p className="break-words text-sm text-muted-foreground">{identity.company}</p>}
            <ul className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
              {identity.meta}
              <li className="flex items-center gap-1.5">
                <FolderKanban className="size-3.5 text-[#174D32]/70" aria-hidden />
                {projectLabel}
              </li>
              <li className="flex items-center gap-1.5">
                <CalendarDays className="size-3.5 text-[#174D32]/70" aria-hidden />
                {`Client since ${info.clientSince}`}
              </li>
            </ul>
          </div>
        </div>
        {identity.actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 max-md:[&>*]:min-h-11 max-md:[&>*]:flex-1">
            {identity.actions}
          </div>
        )}
      </header>

      <div className="flex flex-col gap-5 p-5 md:px-6">
      <div className="flex flex-col divide-y divide-border">
        <Group title="Contact information">
          <Field icon={Mail} label="Email">
            {info.email ? (
              EMAIL_PATTERN.test(info.email) ? (
                <a href={`mailto:${info.email}`} className={cn(linkClass, 'break-all')}>
                  {info.email}
                </a>
              ) : (
                <span className="break-all">{info.email}</span>
              )
            ) : (
              <Missing />
            )}
          </Field>
          <Field icon={Phone} label="Phone">
            {info.phone ? (
              phoneLink ? (
                <a href={phoneLink} className={linkClass}>
                  {info.phone}
                </a>
              ) : (
                info.phone
              )
            ) : (
              <Missing />
            )}
          </Field>
          <Field icon={PhoneForwarded} label="Alternate phone">
            {info.alternatePhone ? (
              altLink ? (
                <a href={altLink} className={linkClass}>
                  {info.alternatePhone}
                </a>
              ) : (
                info.alternatePhone
              )
            ) : (
              <Missing />
            )}
          </Field>
          <Field icon={MessageSquare} label="Preferred contact method">
            {info.preferredContact || <Missing />}
          </Field>
        </Group>

        <Group title="Mailing address" columns={false}>
          <Field icon={MapPin} label="Address">
            {info.mailingAddress ? <span className="whitespace-pre-line">{info.mailingAddress}</span> : <Missing />}
          </Field>
        </Group>
      </div>

      {info.notes && (
        <div className="flex flex-col gap-1 rounded-lg bg-muted p-4">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Internal notes · staff only
          </h3>
          <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{info.notes}</p>
        </div>
      )}
      </div>
    </section>
  )
}
