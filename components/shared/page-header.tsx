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
  /** 'section' is the compact heading used inside the project workspace, beneath the project tabs. */
  tone?: 'plain' | 'sage' | 'forest' | 'section'
  /** Replaces the icon tile, e.g. with a person's initials. */
  avatar?: React.ReactNode
  /** Rendered inline after the title, e.g. a status badge. */
  titleAddon?: React.ReactNode
  /** Record count for list pages, shown as a quiet chip beside the title. */
  count?: { value: number; noun: string; plural?: string }
}

function CountChip({ value, noun, plural }: NonNullable<PageHeaderProps['count']>) {
  return (
    <span className="inline-flex items-center rounded-full bg-sage px-2.5 py-0.5 text-sm font-medium tabular-nums text-foreground/80 ring-1 ring-inset ring-primary/10">
      {`${value.toLocaleString()} ${value === 1 ? noun : (plural ?? `${noun}s`)}`}
    </span>
  )
}

export function PageHeader({
  title,
  description,
  eyebrow,
  icon: Icon,
  avatar,
  titleAddon: titleAddonProp,
  count,
  backHref,
  backLabel,
  actions,
  tone = 'sage',
}: PageHeaderProps) {
  if (tone === 'section') {
    return (
      <header className="flex min-w-0 flex-col gap-3 border-b border-border/70 pb-4 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="min-w-0 text-balance font-serif text-xl font-semibold leading-tight tracking-tight text-foreground md:text-2xl">
              {title}
            </h1>
            {count && <CountChip {...count} />}
            {titleAddonProp}
          </div>
          {description && <div className="max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">{description}</div>}
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 max-md:[&>*]:min-h-11 md:justify-end">{actions}</div>
        )}
      </header>
    )
  }
  // Every top-level page uses one compact heading: back link, optional icon, title row, short description, and
  // the primary action pinned to the right. The legacy 'sage'/'forest' intro cards and the 'plain' variant all
  // render this same treatment so headings align and size identically across the app.
  return (
    <header className="flex min-w-0 flex-col gap-2">
      {backHref && <BackLink href={backHref} label={backLabel} />}
      <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          {avatar}
          {!avatar && Icon && (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sage text-primary ring-1 ring-inset ring-primary/10">
              <Icon className="size-5" aria-hidden="true" />
            </span>
          )}
          <div className="flex min-w-0 flex-col gap-0.5">
            {eyebrow && (
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {eyebrow}
              </div>
            )}
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="min-w-0 text-balance font-serif text-xl font-semibold leading-tight tracking-tight text-foreground md:text-2xl">
                {title}
              </h1>
              {count && <CountChip {...count} />}
              {titleAddonProp}
            </div>
            {description && (
              <div className="max-w-3xl text-pretty text-sm leading-relaxed text-muted-foreground">{description}</div>
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

export function BackLink({ href, label, className }: { href: string; label?: string; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        'group flex w-fit items-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" aria-hidden="true" />
      {label ?? 'Back'}
    </Link>
  )
}

/**
 * App-wide page width rules. Every variant is left-aligned to the same workspace gutter so headings line up
 * from page to page; only the inner measure differs.
 * - workspace: dashboards, lists, tables, schedules, libraries — the full width beside the sidebar.
 * - detail: record pages and dense editors — full width, optionally split with <DetailLayout> supporting panel.
 * - form: create/edit/settings forms — a readable measure so short inputs don't stretch across large monitors.
 */
export type PageWidth = 'workspace' | 'detail' | 'form'

export function pageLayout(width: PageWidth = 'workspace', className?: string) {
  return cn('flex w-full min-w-0 flex-col gap-5 md:gap-6', width === 'form' && 'max-w-4xl', className)
}

export function PageContainer({
  width = 'workspace',
  className,
  children,
}: {
  width?: PageWidth
  className?: string
  children: React.ReactNode
}) {
  return <div className={pageLayout(width, className)}>{children}</div>
}

/** Main content with an optional supporting panel; the panel stacks beneath the content below desktop width. */
export function DetailLayout({
  aside,
  asideLabel,
  className,
  children,
}: {
  aside?: React.ReactNode
  asideLabel?: string
  className?: string
  children: React.ReactNode
}) {
  if (!aside) return <div className={cn('flex min-w-0 flex-col gap-5 md:gap-6', className)}>{children}</div>
  return (
    <div className={cn('grid min-w-0 gap-5 md:gap-6 xl:grid-cols-[minmax(0,1fr)_20rem] 2xl:grid-cols-[minmax(0,1fr)_24rem]', className)}>
      <div className="flex min-w-0 flex-col gap-5 md:gap-6">{children}</div>
      <aside aria-label={asideLabel} className="flex min-w-0 flex-col gap-5 md:gap-6">
        {aside}
      </aside>
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
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-input bg-card px-6 py-12 text-center">
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
