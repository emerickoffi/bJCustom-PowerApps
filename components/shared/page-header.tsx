import Link from 'next/link'
import { ArrowLeft, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

type IconComponent = React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>

type PageHeaderProps = {
  title: string
  icon?: IconComponent
  /** Replaces the icon tile, e.g. with a person's or company's initials on a record page. */
  avatar?: React.ReactNode
  /** Short record context above the title, e.g. the linked project or record number. */
  eyebrow?: React.ReactNode
  /** Record count for list pages, shown as a chip beside the title. */
  count?: { value: number; noun: string; plural?: string }
  /** Rendered inline after the title, e.g. a status badge or contextual help. */
  titleAddon?: React.ReactNode
  /**
   * Compact record metadata for detail and editor pages: status, revision, linked project or recipient,
   * operational warnings. Not a place for descriptive subtitles; standard list pages leave it empty.
   */
  meta?: React.ReactNode
  backHref?: string
  backLabel?: string
  /** Secondary actions first, primary (orange) action last. */
  actions?: React.ReactNode
}

export function CountChip({ value, noun, plural }: NonNullable<PageHeaderProps['count']>) {
  return (
    <span className="inline-flex h-6 items-center rounded-full bg-interactive-soft px-2.5 text-xs font-semibold tabular-nums text-interactive-strong ring-1 ring-inset ring-interactive-border md:text-sm">
      {`${value.toLocaleString()} ${value === 1 ? noun : (plural ?? `${noun}s`)}`}
    </span>
  )
}

export function PageHeaderIcon({ icon: Icon }: { icon: IconComponent }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-interactive-soft text-interactive ring-1 ring-inset ring-interactive-border">
      <Icon className="size-5" aria-hidden="true" />
    </span>
  )
}

/** The one heading used by every page: [icon] Title [count] on the left, actions on the right. */
export function PageHeader({
  title,
  icon,
  avatar,
  eyebrow,
  count,
  titleAddon,
  meta,
  backHref,
  backLabel,
  actions,
}: PageHeaderProps) {
  return (
    <header className="flex min-w-0 flex-col gap-2">
      {backHref && <BackLink href={backHref} label={backLabel} />}
      <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {avatar ?? (icon && <PageHeaderIcon icon={icon} />)}
          <div className="flex min-w-0 flex-col gap-0.5">
            {eyebrow && (
              <div className="flex min-w-0 items-center gap-2 truncate text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {eyebrow}
              </div>
            )}
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="min-w-0 text-balance break-words font-serif text-xl font-semibold leading-tight tracking-tight text-foreground md:text-[26px]">
                {title}
              </h1>
              {count && <CountChip {...count} />}
              {titleAddon}
            </div>
          </div>
        </div>
        {actions && (
          <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2 max-md:[&>*]:min-h-11 md:justify-end md:[&_[data-slot=button]]:h-10">
            {actions}
          </div>
        )}
      </div>
      {meta && (
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">{meta}</div>
      )}
    </header>
  )
}

/** Contextual help beside a page title: collapsed by default so it never reserves space under the heading. */
export function HeaderHelp({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="group relative">
      <summary className="flex size-7 cursor-pointer list-none items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-interactive-soft hover:text-interactive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
        <Info className="size-4" aria-hidden="true" />
        <span className="sr-only">{label}</span>
      </summary>
      <div className="absolute left-0 top-full z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-popover p-3 text-sm leading-relaxed text-popover-foreground shadow-lg">
        {children}
      </div>
    </details>
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
