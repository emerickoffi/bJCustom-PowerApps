type AuthShellProps = {
  title: string
  description?: string
  children: React.ReactNode
}

/** General Trefort auth surface. Builder branding belongs only on verified builder-specific pages. */
export function AuthShell({ title, description, children }: AuthShellProps) {
  return (
    <main className="flex min-h-svh flex-col items-center bg-background px-4 py-10 sm:py-16">
      <div className="my-auto flex w-full max-w-[420px] flex-col gap-6">
        <p className="text-center font-serif text-3xl font-semibold tracking-tight text-foreground">{'Trefort'}</p>
        <div className="rounded-[8px] border bg-card p-6 shadow-sm sm:p-8">
          <div className="mb-6 flex flex-col gap-1.5">
            <h1 className="text-xl font-semibold text-foreground">{title}</h1>
            {description && <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>}
          </div>
          {children}
        </div>
        <footer className="text-center text-xs text-muted-foreground">{'Trefort · Construction management'}</footer>
      </div>
    </main>
  )
}
