'use client'

// Last-resort boundary for errors in the root layout itself. It replaces the whole document,
// so it carries its own <html> and plain inline styles instead of the app's CSS.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', background: '#f7f6f3', color: '#17212b' }}>
        <main style={{ minHeight: '100svh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div role="alert" style={{ maxWidth: 440, textAlign: 'center' }}>
            <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>Trefort couldn&apos;t load</h1>
            <p style={{ fontSize: 15, lineHeight: 1.5, color: '#5b6470', margin: '0 0 20px' }}>
              Something went wrong on our side. Your data has not been changed. Try again in a moment.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={reset}
                style={{ padding: '10px 18px', borderRadius: 8, border: 0, background: '#00788d', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
              >
                Try again
              </button>
              <a href="/" style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid #d5d9de', color: '#17212b', fontSize: 15, textDecoration: 'none' }}>
                Go to start
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  )
}
