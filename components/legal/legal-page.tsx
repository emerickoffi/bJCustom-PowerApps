import Link from 'next/link'
import { LEGAL } from '@/lib/legal'

type LegalPageProps = {
  title: string
  summary: string
  children: React.ReactNode
}

/** Shared public layout for the Terms of Service and Privacy Policy. Works signed in or out. */
export function LegalPage({ title, summary, children }: LegalPageProps) {
  return (
    <main className="min-h-svh bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-4">
          <Link href="/" className="font-serif text-xl font-semibold tracking-tight text-foreground">
            {'Trefort'}
          </Link>
          <nav aria-label="Legal" className="flex gap-4 text-sm">
            <Link href="/terms" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              Terms
            </Link>
            <Link href="/privacy" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              Privacy
            </Link>
          </nav>
        </div>
      </header>
      <article className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Effective {LEGAL.effectiveDate}</p>
        <p className="mt-6 rounded-[8px] border bg-muted/40 p-4 text-sm leading-relaxed text-foreground">{summary}</p>
        <div className="legal-body mt-8 flex flex-col gap-8 text-[15px] leading-relaxed text-foreground [&_a]:font-medium [&_a]:text-primary [&_a]:underline-offset-4 hover:[&_a]:underline [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_section]:flex [&_section]:flex-col [&_section]:gap-3 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5">
          {children}
        </div>
      </article>
      <footer className="border-t">
        <div className="mx-auto max-w-3xl px-5 py-6 text-xs text-muted-foreground">
          {`${LEGAL.product} is operated by ${LEGAL.operator}. Questions: `}
          <a href={`mailto:${LEGAL.contactEmail}`} className="underline underline-offset-4">
            {LEGAL.contactEmail}
          </a>
        </div>
      </footer>
    </main>
  )
}

/** Small "Terms · Privacy" links for auth screens and footers. */
export function LegalLinks({ className }: { className?: string }) {
  return (
    <p className={className}>
      <Link href="/terms" className="underline-offset-4 hover:underline">
        Terms of Service
      </Link>
      {' · '}
      <Link href="/privacy" className="underline-offset-4 hover:underline">
        Privacy Policy
      </Link>
    </p>
  )
}
