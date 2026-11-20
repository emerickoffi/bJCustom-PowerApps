'use client'

import { useEffect } from 'react'

/**
 * Runs only inside the Trefort iPhone/Android app (Capacitor). In a normal browser it does nothing and its
 * native code is never downloaded.
 *
 * - Marks <html data-native="ios|android"> so styles can respect the notch and home indicator.
 * - Android back button: goes back a page, and closes the app from the first screen.
 * - Links to other websites (help pages, Stripe receipts, map links) open in the phone's browser instead of
 *   replacing the app.
 * - Hides the splash screen as soon as the first page has painted.
 */
export function NativeShell() {
  useEffect(() => {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } }).Capacitor
    if (!cap?.isNativePlatform?.()) return

    let cleanup: (() => void) | undefined
    let cancelled = false

    void (async () => {
      const [{ App }, { Browser }, { SplashScreen }, { StatusBar, Style }] = await Promise.all([
        import('@capacitor/app'),
        import('@capacitor/browser'),
        import('@capacitor/splash-screen'),
        import('@capacitor/status-bar'),
      ])
      if (cancelled) return

      const platform = cap.getPlatform?.() ?? 'native'
      document.documentElement.dataset.native = platform

      StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined)
      SplashScreen.hide({ fadeOutDuration: 200 }).catch(() => undefined)

      const back = await App.addListener('backButton', ({ canGoBack }) => {
        if (canGoBack) window.history.back()
        else void App.exitApp()
      })

      // Pages that must stay inside the app: Trefort itself and the QuickBooks sign-in it returns from.
      const inApp = (url: URL) =>
        url.origin === window.location.origin || /(^|\.)intuit\.com$/.test(url.hostname)

      const onClick = (event: MouseEvent) => {
        if (event.defaultPrevented || event.button !== 0) return
        const anchor = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
        if (!anchor) return
        let url: URL
        try {
          url = new URL(anchor.href, window.location.href)
        } catch {
          return
        }
        if (url.protocol === 'tel:' || url.protocol === 'mailto:' || url.protocol === 'sms:') return
        if (!/^https?:$/.test(url.protocol)) return
        if (inApp(url) && anchor.target !== '_blank') return
        if (inApp(url) && url.origin === window.location.origin) {
          // A Trefort page that asked for a new tab (e.g. a printable invoice): stay in the app.
          event.preventDefault()
          window.location.assign(url.toString())
          return
        }
        event.preventDefault()
        void Browser.open({ url: url.toString(), presentationStyle: 'popover' })
      }
      document.addEventListener('click', onClick, true)

      cleanup = () => {
        document.removeEventListener('click', onClick, true)
        void back.remove()
      }
    })()

    return () => {
      cancelled = true
      cleanup?.()
    }
  }, [])

  return null
}
