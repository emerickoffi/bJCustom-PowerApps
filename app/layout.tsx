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
  applicationName: 'Bativo',
  appleWebApp: {
    capable: true,
    title: 'Bativo',
    statusBarStyle: 'default',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
}

export const viewport: Viewport = {
  themeColor: '#174D38',
  width: 'device-width',
  initialScale: 1,
  // The shell already pads with env(safe-area-inset-*), so standalone mode can use the full screen in both iPad orientations.
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${sourceSerif.variable} bg-background`}>
      <body>
        {children}
        <Toaster position="top-right" />
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
