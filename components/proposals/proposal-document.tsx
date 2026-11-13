import { formatCentsExact } from '@/lib/estimates'
import { closingSections, pricingRows, type ClientPricing, type PricingDisplay, type ProposalText } from '@/lib/proposals'
import { cn } from '@/lib/utils'

export type ProposalHeader = {
  companyName: string
  companyLines: string[]
  title: string
  number: string
  date: string
  validUntil: string | null
  projectName: string
  projectAddress: string | null
  preparedFor: string | null
}

type BodyProps = {
  content: ProposalText
  pricingDisplay: PricingDisplay
  scope: string | null
  pricing: ClientPricing
  /** Wraps each section in a card (portal) instead of the flat page layout (document preview). */
  sectioned?: boolean
}

function Section({ id, title, sectioned, children }: { id: string; title: string; sectioned?: boolean; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className={cn('flex flex-col gap-3', sectioned && 'surface p-5 md:p-6')}>
      <h2 id={id} className={sectioned ? 'type-section-title text-foreground' : 'text-xs font-semibold uppercase tracking-wider text-primary'}>
        {title}
      </h2>
      {children}
    </section>
  )
}

function Prose({ text }: { text: string }) {
  return <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/85">{text}</p>
}

function TotalRow({ label, cents, strong, muted }: { label: string; cents: number; strong?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className={cn('text-sm', strong ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{label}</dt>
      <dd className={cn('tabular-nums', strong ? 'text-base font-semibold text-foreground' : 'text-sm', muted ? 'text-muted-foreground' : 'text-foreground')}>
        {formatCentsExact(cents)}
      </dd>
    </div>
  )
}

/** Customer-facing proposal sections. Shared by the staff preview and the homeowner portal so both show the same content. */
export function ProposalBody({ content, pricingDisplay, scope, pricing, sectioned }: BodyProps) {
  const rows = pricingRows(pricing, pricingDisplay)
  const hasLand = (pricing.land_cost_cents ?? 0) > 0
  return (
    <>
      {content.introduction && (
        <Section id="proposal-intro" title="Introduction" sectioned={sectioned}>
          <Prose text={content.introduction} />
        </Section>
      )}
      {scope && (
        <Section id="proposal-scope" title="Scope of work" sectioned={sectioned}>
          <Prose text={scope} />
        </Section>
      )}
      <Section id="proposal-pricing" title="Pricing" sectioned={sectioned}>
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[20rem] text-sm">
              <caption className="sr-only">Proposal pricing</caption>
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th scope="col" className="py-2 pr-3 font-medium">
                    {pricingDisplay === 'category' ? 'Category' : 'Item'}
                  </th>
                  <th scope="col" className="py-2 text-right font-medium">
                    Price
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={`${row.label}:${i}`} className="border-b border-border/60 align-top last:border-0">
                    <td className="py-2.5 pr-3">
                      <span className="block font-medium text-foreground">{row.label}</span>
                      {row.detail && <span className="text-xs text-muted-foreground">{row.detail}</span>}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-foreground">{formatCentsExact(row.cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows.length === 0 && pricingDisplay !== 'total' && (
          <p className="text-sm text-muted-foreground">No priced items yet.</p>
        )}
        <dl className="ml-auto flex w-full max-w-sm flex-col divide-y border-t pt-1">
          {pricing.allowance_cents > 0 && <TotalRow label="Allowances included" cents={pricing.allowance_cents} muted />}
          <TotalRow label={hasLand ? 'Construction total' : 'Total'} cents={pricing.construction_total_cents} strong={!hasLand} />
          {hasLand && (
            <>
              <TotalRow label="Land" cents={pricing.land_cost_cents ?? 0} />
              <TotalRow label="Total" cents={pricing.total_with_land_cents} strong />
            </>
          )}
        </dl>
        {pricing.allowance_cents > 0 && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Allowances are budgets for items you select. Selections above or below an allowance are adjusted by change order.
          </p>
        )}
      </Section>
      {closingSections(content).map((s) => (
        <Section key={s.field} id={`proposal-${s.field}`} title={s.heading} sectioned={sectioned}>
          <Prose text={s.body} />
        </Section>
      ))}
    </>
  )
}

/** Full proposal page as it is printed and sent: letterhead, project block, body, and acceptance. */
export function ProposalDocument({ header, ...body }: BodyProps & { header: ProposalHeader }) {
  return (
    <article aria-label="Proposal preview" className="flex flex-col gap-7 bg-white p-6 text-foreground md:p-10">
      <header className="flex flex-col gap-4 border-b-2 border-primary pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <p className="font-serif text-lg font-semibold uppercase tracking-wide text-brand-deep">{header.companyName}</p>
          {header.companyLines.map((line) => (
            <p key={line} className="text-xs text-muted-foreground">
              {line}
            </p>
          ))}
        </div>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">Proposal</p>
      </header>

      <div className="flex flex-col gap-4 rounded-lg border border-l-4 border-l-primary bg-[#EAF0E9] p-5">
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Project</p>
          <p className="font-serif text-xl font-semibold text-brand-deep text-balance">{header.projectName}</p>
          {header.projectAddress && <p className="text-sm text-foreground/80">{header.projectAddress}</p>}
        </div>
        <dl className="grid grid-cols-2 gap-4 border-t pt-3 text-sm md:grid-cols-4">
          <div className="flex flex-col gap-0.5">
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Proposal no.</dt>
            <dd className="font-mono">{header.number}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Date</dt>
            <dd>{header.date}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Valid until</dt>
            <dd>{header.validUntil ?? 'No expiration'}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Prepared for</dt>
            <dd>{header.preparedFor ?? 'Client not assigned'}</dd>
          </div>
        </dl>
      </div>

      <h1 className="font-serif text-2xl font-semibold text-balance">{header.title}</h1>

      <ProposalBody {...body} />

      <section aria-labelledby="proposal-acceptance" className="flex flex-col gap-4 border-t pt-5">
        <h2 id="proposal-acceptance" className="text-xs font-semibold uppercase tracking-wider text-primary">
          Acceptance
        </h2>
        {body.content.acceptance_text && <Prose text={body.content.acceptance_text} />}
        <div className="grid gap-6 pt-4 sm:grid-cols-2">
          {['Homeowner signature', 'Date'].map((label) => (
            <div key={label} className="flex flex-col gap-1.5">
              <div className="h-8 border-b border-foreground/40" />
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      </section>
    </article>
  )
}
