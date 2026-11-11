import type { AuthImage } from '@/lib/auth-image'

type AuthShellProps = {
  title: string
  description?: string
  /** When provided, renders the split layout with this image on large screens. */
  image?: AuthImage
  children: React.ReactNode
}

/** 1x1 transparent GIF so viewports that hide the image panel never download the photo. */
const EMPTY_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='

function Wordmark({ className }: { className?: string }) {
  return <p className={`font-serif font-semibold tracking-tight ${className ?? ''}`}>{'Trefort'}</p>
}

function AuthHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-6 flex flex-col gap-1.5">
      <h1 className="text-xl font-semibold text-foreground">{title}</h1>
      {description && <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>}
    </div>
  )
}

function ImagePanel({ image }: { image: AuthImage }) {
  const srcSet = image.sources.map(([src, width]) => `${src} ${width}w`).join(', ')
  return (
    <aside aria-hidden="true" className="relative hidden bg-stone-700 lg:sticky lg:top-0 lg:block lg:h-svh lg:w-3/5">
      <picture>
        <source media="(min-width: 1024px)" srcSet={srcSet} sizes="60vw" />
        <img
          src={EMPTY_PIXEL}
          alt=""
          decoding="async"
          className="absolute inset-0 size-full object-cover"
          style={{ objectPosition: image.focalPoint }}
        />
      </picture>
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/55 to-transparent" />
      <Wordmark className="absolute left-10 top-8 text-3xl text-white" />
    </aside>
  )
}

/** General Trefort auth surface. Builder branding belongs only on verified builder-specific pages. */
export function AuthShell({ title, description, image, children }: AuthShellProps) {
  if (image) {
    return (
      <main className="flex min-h-svh bg-card">
        <ImagePanel image={image} />
        <div className="flex min-h-svh flex-1 flex-col items-center px-5 py-10 sm:px-10 lg:w-2/5 lg:px-12">
          <div className="my-auto flex w-full max-w-[420px] flex-col">
            <Wordmark className="mb-10 text-2xl text-foreground lg:hidden" />
            <AuthHeading title={title} description={description} />
            {children}
          </div>
          <footer className="mt-10 text-center text-xs text-muted-foreground">{'Trefort · Construction management'}</footer>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-svh flex-col items-center bg-background px-4 py-10 sm:py-16">
      <div className="my-auto flex w-full max-w-[420px] flex-col gap-6">
        <Wordmark className="text-center text-3xl text-foreground" />
        <div className="rounded-[8px] border bg-card p-6 shadow-sm sm:p-8">
          <AuthHeading title={title} description={description} />
          {children}
        </div>
        <footer className="text-center text-xs text-muted-foreground">{'Trefort · Construction management'}</footer>
      </div>
    </main>
  )
}
