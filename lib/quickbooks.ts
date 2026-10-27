import 'server-only'

export type QuickBooksStatus = {
  credentialsConfigured: boolean
  connected: boolean
}

export function getQuickBooksStatus(): QuickBooksStatus {
  const credentialsConfigured = Boolean(process.env.QUICKBOOKS_CLIENT_ID && process.env.QUICKBOOKS_CLIENT_SECRET)
  // No OAuth connection flow or token storage exists yet, so a connection can never be verified.
  // Keep this false until a real authorized connection is stored; never infer it from credentials alone.
  return { credentialsConfigured, connected: false }
}

export function quickBooksStatusLabel(status: QuickBooksStatus) {
  if (!status.credentialsConfigured) return 'Setup Required — API credentials missing'
  if (!status.connected) return 'Setup Required — not connected'
  return 'Connected'
}
