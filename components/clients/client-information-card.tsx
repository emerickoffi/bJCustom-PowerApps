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

export function ClientInformationCard({ info }: { info: ClientInformation }) {
  const phoneLink = info.phone ? telHref(info.phone) : null
  const altLink = info.alternatePhone ? telHref(info.alternatePhone) : null

  return (
    <section
      aria-labelledby="client-information-heading"
      className="flex flex-col gap-5 rounded-xl border bg-card p-5 shadow-xs"
    >
      <header className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sage text-primary ring-1 ring-inset ring-primary/10">
          <ContactRound className="size-4" aria-hidden />
        </div>
        <div className="flex flex-col gap-0.5">
          <h2 id="client-information-heading" className="font-serif text-lg font-semibold leading-tight text-foreground">
            Client Information
          </h2>
          <p className="text-sm text-muted-foreground">Contact details and account information</p>
        </div>
      </header>

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

        <Group title="Account information">
          <Field icon={CalendarDays} label="Client since">
            {info.clientSince}
          </Field>
          <Field icon={FolderKanban} label="Associated projects">
            {info.projectCount}
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
    </section>
  )
}
