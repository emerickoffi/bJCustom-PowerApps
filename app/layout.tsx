import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Inter, Source_Serif_4 } from 'next/font/google'
import { Toaster } from '@/components/ui/sonner'
import { PRODUCT_BRAND } from '@/lib/product-brand'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
// Only the printable estimate and daily-log documents use the serif face, so it is not preloaded:
// the browser fetches it on those pages alone and app screens download Inter only.
const sourceSerif = Source_Serif_4({ subsets: ['latin'], variable: '--font-source-serif', preload: false })

export const metadata: Metadata = {
  title: {
    default: PRODUCT_BRAND.name,
    template: `%s | ${PRODUCT_BRAND.name}`,
  },
  description: PRODUCT_BRAND.description,
  applicationName: PRODUCT_BRAND.name,
  appleWebApp: { title: PRODUCT_BRAND.name },
  generator: 'v0.app',
}

export const viewport: Viewport = {
  themeColor: PRODUCT_BRAND.themeColor,
  width: 'device-width',
  initialScale: 1,
}

const DEV_PERFORMANCE_MEASURE_GUARD = `(function () {
  var perf = window.performance;
  if (!perf || typeof perf.measure !== 'function' || perf.__v0MeasureGuard) return;
  var measure = perf.measure.bind(perf);
  var clamp = function (value) { return typeof value === 'number' && value < 0 ? 0 : value; };
  perf.measure = function (name, start, end) {
    try {
      return measure.apply(null, arguments);
    } catch (error) {
      if (!(error instanceof TypeError) || String(error.message).indexOf('negative time stamp') === -1) throw error;
      try {
        if (start && typeof start === 'object') {
          var options = Object.assign({}, start, { start: clamp(start.start), end: clamp(start.end) });
          return measure(name, options);
        }
        return measure(name, clamp(start), clamp(end));
      } catch (_) {
        return undefined;
      }
    }
  };
  perf.__v0MeasureGuard = true;
})();`

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${sourceSerif.variable} bg-background`}>
      <body>
        {/* React 19.2's dev-only RSC performance track can pass a negative start time to
            performance.measure for server components (e.g. OwnerDashboard), which throws.
            Clamp the timestamps so the dev timeline keeps working instead of erroring.
            Rendered in <body> because the v0 preview injects its own scripts into <head>,
            which shifts head children and causes a hydration mismatch. */}
        {process.env.NODE_ENV === 'development' && (
          <script
            suppressHydrationWarning
            dangerouslySetInnerHTML={{ __html: DEV_PERFORMANCE_MEASURE_GUARD }}
          />
        )}
        {children}
        <Toaster position="top-right" />
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
