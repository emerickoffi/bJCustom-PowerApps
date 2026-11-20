import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Trefort for iPhone and Android.
 *
 * The store apps are a native shell around the live web app at app.trefortpro.com, so every deploy reaches phones
 * without a store update. The native side adds what the web can't: the app icon and splash, the system status bar,
 * the Android back button, opening outside links in the phone's browser, and (next) push notifications.
 *
 * mobile/www holds only the screen shown when the phone can't reach the server on first launch.
 */
const APP_HOST = 'app.trefortpro.com'

const config: CapacitorConfig = {
  appId: 'com.trefortpro.app',
  appName: 'Trefort',
  webDir: 'mobile/www',
  server: {
    url: `https://${APP_HOST}`,
    errorPath: 'offline.html',
    // Pages that must open inside the app because they return to it signed in (QuickBooks connect).
    allowNavigation: [APP_HOST, 'appcenter.intuit.com', 'accounts.intuit.com', '*.intuit.com'],
  },
  ios: {
    // Keeps pages below the notch and status bar; the strip behind it shows the teal background.
    contentInset: 'automatic',
    // Lets the web app's offline mode (service worker) run inside the iPhone app.
    limitsNavigationsToAppBoundDomains: true,
    backgroundColor: '#00788D',
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#00788D',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 3000,
      launchAutoHide: true,
      backgroundColor: '#00788D',
      showSpinner: false,
      androidScaleType: 'CENTER_INSIDE',
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#00788D',
      overlaysWebView: false,
    },
  },
}

export default config
