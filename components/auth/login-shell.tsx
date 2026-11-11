import { TrefortLogo } from '@/components/brand/trefort-logo'

/** Login-only surface: solid sidebar teal, logo on teal, compact white card. */
export function LoginShell({ children }: { children: React.ReactNode }) {
  return (
    <main data-login-shell className="flex min-h-svh flex-col items-center overflow-x-hidden bg-[#00788d] px-4 py-10 sm:py-16">
      <div className="my-auto flex w-full max-w-[400px] flex-col items-center gap-8 sm:gap-10">
        <TrefortLogo priority className="w-64 sm:w-80" />
        <div className="w-full rounded-[10px] bg-card p-6 shadow-[0_12px_32px_rgb(0_40_48/0.28)] sm:p-8">
          <div className="mb-6 flex flex-col gap-1.5">
            <h1 className="text-xl font-semibold text-foreground">{'Welcome back'}</h1>
            <p className="text-sm text-muted-foreground">{'Sign in to Trefort.'}</p>
          </div>
          {children}
        </div>
      </div>
    </main>
  )
}
