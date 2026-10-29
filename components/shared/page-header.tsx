import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

type PageHeaderProps = {
  title: string
  description?: React.ReactNode
  eyebrow?: React.ReactNode
  icon?: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>
  backHref?: string
  backLabel?: string
  actions?: React.ReactNode
  tone?: 'plain' | 'sage'
  /** Replaces the icon tile, e.g. with a person's initials. */
  avatar?: React.ReactNode
  /** Rendered inline after the title, e.g. a status badge. */
  titleAddon?: React.ReactNode
}

export function PageHeader({
  title,
  description,
  eyebrow,
  icon: Icon,
  avatar,
  titleAddon,
  backHref,
  backLabel,
  actions,
  tone = 'sage',
}: PageHeaderProps) {
  const sage = tone === 'sage'
  return (
    <header
      className={cn(
        'flex min-w-0 flex-col gap-3 md:gap-4',
        sage
          ? 'rounded-xl border border-[#E2E8E2] bg-[#EAF0E9] px-4 py-4 md:px-6 md:py-5'
          : 'border-b border-border/70 pb-4 md:pb-6',
      )}
    >
      {backHref && <BackLink href={backHref} label={backLabel} />}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-start gap-3 md:gap-4">
          {avatar}
          {!avatar && Icon && (
            <span
              className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-xl text-primary ring-1 ring-inset md:size-11',
                sage ? 'bg-white ring-[#174D32]/12' : 'bg-sage ring-primary/10',
              )}
            >
              <Icon className="size-5" aria-hidden="true" />
            </span>
          )}
          <div className="flex min-w-0 flex-col gap-1.5">
            {eyebrow && (
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {eyebrow}
              </div>
            )}
            {titleAddon ? (
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
                <h1 className="min-w-0 text-balance font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground md:text-3xl">
                  {title}
                </h1>
                {titleAddon}
              </div>
            ) : (
              <h1 className="text-balance font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground md:text-3xl">
                {title}
              </h1>
            )}
            {description && (
              <div className="max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground md:text-[0.95rem]">
                {description}
              </div>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 max-md:[&>*]:min-h-11 max-md:[&>*]:flex-1 md:justify-end">
            {actions}
          </div>
        )}
      </div>
    </header>
  )
}

export function BackLink({ href, label }: { href: string; label?: string }) {
  return (
    <Link
      href={href}
      className="group flex w-fit items-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" aria-hidden="true" />
      {label ?? 'Back'}
    </Link>
  )
}

export function PageContainer({
  width = 'default',
  className,
  children,
}: {
  width?: 'default' | 'narrow' | 'form'
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'mx-auto flex w-full flex-col gap-8',
        width === 'narrow' && 'max-w-5xl',
        width === 'form' && 'max-w-4xl',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function SectionHeading({
  id,
  title,
  description,
  action,
  className,
}: {
  id?: string
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-3', className)}>
      <div className="flex min-w-0 flex-col gap-1">
        <h2 id={id} className="font-serif text-xl font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {description && <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function Surface({
  className,
  children,
  ...props
}: React.ComponentProps<'section'>) {
  return (
    <section className={cn('surface flex flex-col gap-5 p-5 md:p-6', className)} {...props}>
      {children}
    </section>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-input bg-card/70 px-6 py-12 text-center">
      <div className="flex size-11 items-center justify-center rounded-xl bg-sage text-primary ring-1 ring-inset ring-primary/10">
        <Icon className="size-5" aria-hidden="true" />
      </div>
      <div className="flex max-w-sm flex-col gap-1.5">
        <h2 className="font-serif text-lg font-semibold text-foreground">{title}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  )
}

export function DetailList({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="flex flex-col gap-1 border-l-2 border-sage pl-3">
          <dt className="text-xs font-medium text-muted-foreground">{item.label}</dt>
          <dd className="text-sm font-medium text-foreground">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}
