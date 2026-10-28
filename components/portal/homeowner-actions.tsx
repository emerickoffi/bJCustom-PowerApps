import Link from 'next/link'
import { ArrowRight, CheckCircle2, ListChecks } from 'lucide-react'
import type { HomeownerAction } from '@/lib/next-actions'

export function HomeownerActions({ actions, showProject }: { actions: HomeownerAction[]; showProject: boolean }) {
  return (
    <section aria-labelledby="homeowner-actions-heading" className="flex flex-col gap-4 rounded-3xl border border-[#E2E8E2] bg-white p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sage text-primary">
          <ListChecks className="size-5" aria-hidden="true" />
        </span>
        <div className="flex flex-col">
          <h2 id="homeowner-actions-heading" className="font-serif text-xl font-semibold text-foreground">
            Your next steps
          </h2>
          <p className="text-sm text-muted-foreground">
            {actions.length ? `${actions.length} ${actions.length === 1 ? 'item needs' : 'items need'} your input.` : 'Everything is up to date.'}
          </p>
        </div>
      </div>
      {actions.length === 0 ? (
        <p className="flex items-center gap-2 rounded-xl bg-[#F8F7F3] px-4 py-3 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4 shrink-0 text-primary" aria-hidden="true" />
          No pending actions. We&apos;ll list anything that needs you here.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-[#E2E8E2] overflow-hidden rounded-xl border border-[#E2E8E2]">
          {actions.map((a) => (
            <li key={a.key}>
              <Link
                href={a.href}
                className="flex min-h-14 flex-col gap-2 px-4 py-3 transition-colors hover:bg-[#F8F7F3] focus-visible:bg-[#F8F7F3] focus-visible:outline-none sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-medium text-foreground">{a.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {showProject ? `${a.project} · ${a.description}` : a.description}
                  </span>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary">
                  {a.actionLabel}
                  <ArrowRight className="size-3.5" aria-hidden="true" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
