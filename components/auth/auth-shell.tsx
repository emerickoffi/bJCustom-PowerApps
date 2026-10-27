import { CompanyLogo } from '@/components/brand/company-logo'

type AuthShellProps = {
  title: string
  description: string
  children: React.ReactNode
}

export function AuthShell({ title, description, children }: AuthShellProps) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-background px-4 py-12">
      <div className="flex w-full max-w-md flex-col gap-8">
        <div className="mx-auto w-64 sm:w-72">
          <CompanyLogo priority />
        </div>
        <div className="rounded-xl border bg-card p-6 shadow-sm sm:p-8">
          <div className="mb-6 flex flex-col gap-1.5">
            <h1 className="font-serif text-2xl font-semibold text-foreground">{title}</h1>
            <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
          </div>
          {children}
        </div>
        <p className="text-center text-xs text-muted-foreground">
          {'Secure client and project management for B & J Custom Homes, Inc.'}
        </p>
      </div>
    </main>
  )
}
