# Trefort store apps (iPhone and Android)

## How it works

- `capacitor.config.ts`: a native shell (Capacitor 8) that opens `https://app.trefortpro.com`. Every web deploy reaches phones with no store update. A new store build is only needed when native code, icons or permissions change.
- `android/` and `ios/`: the native projects. Commit them, but don't hand-edit generated files. After changing plugins or the config, run `npx cap sync`.
- `mobile/www/offline.html`: the screen shown if the phone has no signal the very first time it opens.
- `mobile/assets/`: icon and splash sources. To regenerate:
  `pnpm dlx @capacitor/assets generate --assetPath mobile/assets --android --ios --iconBackgroundColor '#00788D' --splashBackgroundColor '#00788D'`
- `components/app/native-shell.tsx`: in-app behaviour, which does nothing in a normal browser.
  - Handles the Android back button.
  - Opens outside links in the phone's browser.
  - Sets the status bar and hides the splash screen.
  - Sets `<html data-native="ios|android">`.
- **App Store rule:** in the iPhone app, plan purchase and plan-change controls are hidden (`data-store-hidden`). Customers manage billing on the web.

App ID (both stores): `com.trefortpro.app`.

## One-time accounts (owner: Neovel Technologies Group LLC)

1. **D-U-N-S number:** look it up at developer.apple.com/enroll/duns-lookup. Issuing a new one can take up to 5 business days.
2. **Apple Developer Program:** $99/year, enroll as an organization. In App Store Connect:
   - Create the app: name "Trefort", bundle ID `com.trefortpro.app`, SKU `trefort-ios`.
   - Copy its **Apple ID** (a number) into `APP_STORE_APPLE_ID` in `codemagic.yaml`.
   - Create an **App Store Connect API key** (Users and Access → Integrations, App Manager role).
3. **Google Play Console:** $25 once, organization account. Create the app "Trefort". Then:
   - Create a Google Cloud service account with Play Console access and download its JSON key.
   - Upload the **first** build by hand: Play requires one manual upload before automated publishing works.
4. **Codemagic** (codemagic.io): sign in with GitHub and add the `emerickoffi/trefort-app` repo. Then:
   - Team → Integrations → App Store Connect: add the API key and name it `Trefort App Store Connect`.
   - Team → Code signing → iOS: let Codemagic fetch or create the distribution certificate and the App Store profile for `com.trefortpro.app`.
   - Team → Code signing → Android keystores: generate an upload keystore with reference `trefort_upload_key`. **Download and keep a backup.** Losing it means a support request to Google.
   - Environment variables: create group `google_play` with `GCLOUD_SERVICE_ACCOUNT_CREDENTIALS` (the JSON), marked secure.

## Releasing

Push a tag such as `mobile-v1.0.0`. Codemagic builds both apps:
- **iPhone:** goes to TestFlight.
- **Android:** goes to Google Play's internal testing track as a draft.

Promote builds to production in each store's console.

## Before the first App Store review

- **Demo login:** give Apple a reviewer account (for example, on the Demo Builders company).
- **Privacy details:** in App Store Connect, declare what's collected: contact info, photos, and usage data tied to the account.
- **Account deletion:** Apple requires apps with sign-up to offer in-app account deletion. This must be built before submitting.
- **Native value:** Apple rejects "just a website" apps (guideline 4.2). Camera and photo capture, offline jobsite mode and the native shell help. Push notifications are the planned next native feature.
