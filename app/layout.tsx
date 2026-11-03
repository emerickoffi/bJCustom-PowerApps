import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Inter, Source_Serif_4 } from 'next/font/google'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const sourceSerif = Source_Serif_4({ subsets: ['latin'], variable: '--font-source-serif' })

export const metadata: Metadata = {
  title: {
    default: 'B & J Custom Homes',
    template: '%s | B & J Custom Homes',
  },
  description: 'Client, project, and construction management for B & J Custom Homes, Inc.',
  generator: 'v0.app',
}

export const viewport: Viewport = {
  themeColor: '#174D38',
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
      {process.env.NODE_ENV === 'development' && (
        <head>
          {/* React 19.2's dev-only RSC performance track can pass a negative start time to
              performance.measure for server components (e.g. OwnerDashboard), which throws.
              Clamp the timestamps so the dev timeline keeps working instead of erroring. */}
          <script dangerouslySetInnerHTML={{ __html: DEV_PERFORMANCE_MEASURE_GUARD }} />
        </head>
      )}
      <body>
        {children}
        <Toaster position="top-right" />
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
