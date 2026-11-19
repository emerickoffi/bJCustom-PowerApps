/* Trefort service worker: lets the app open with no signal on a jobsite.
 *
 * - App files (/_next/static) are cached forever; they are content-hashed, so a new deploy never collides.
 * - Pages are network-first: online you always get the latest; offline you get the last copy this phone opened,
 *   or the offline page (which shows work waiting to upload).
 * - Saving never goes through here (server actions are POST requests), so nothing can be "saved" to a cache.
 * - Page copies are personal: the app clears them on sign-out and when a different person signs in.
 */

const STATIC_CACHE = 'trefort-static-v1'
const PAGES_CACHE = 'trefort-pages-v1'
const OFFLINE_URL = '/offline'
const PRECACHE = [OFFLINE_URL, '/icon.svg', '/icons/icon-192.png']
const MAX_PAGES = 80
/** Never cached: sign-in, invitations, billing and the owner console must always be live. */
const LIVE_ONLY = ['/auth', '/api', '/invite', '/billing', '/platform', '/account', '/onboarding', '/no-access']

/** Caches the app files a page needs, so its offline copy can also run (not just display). */
async function cacheAssetsOf(html) {
  const cache = await caches.open(STATIC_CACHE)
  const found = new Set(html.match(/\/_next\/static\/[^"'\s)\\]+/g) || [])
  await Promise.all(
    [...found].map(async (path) => {
      if (await cache.match(path)) return
      try {
        const res = await fetch(path)
        if (res.ok) await cache.put(path, res)
      } catch {
        // Offline or gone after a deploy: the page still shows, just without that script.
      }
    }),
  )
}

/** Saves a full copy of a page (and its app files) for offline use. */
async function warmPage(path) {
  if (isLiveOnly(path)) return
  try {
    const res = await fetch(path, { credentials: 'same-origin', headers: { accept: 'text/html' } })
    const type = res.headers.get('content-type') || ''
    if (!res.ok || res.redirected || !type.includes('text/html')) return
    const html = await res.clone().text()
    const cache = await caches.open(PAGES_CACHE)
    await cache.put(path, res)
    await cacheAssetsOf(html)
    await trimPages(cache)
  } catch {
    // Offline: try again next time.
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => caches.match(OFFLINE_URL))
      .then((res) => (res ? res.text().then(cacheAssetsOf) : undefined))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('trefort-') && k !== STATIC_CACHE && k !== PAGES_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  const data = event.data || {}
  if (data.type === 'clear-pages') event.waitUntil(caches.delete(PAGES_CACHE))
  if (data.type === 'warm' && Array.isArray(data.paths)) {
    const paths = data.paths.filter((p) => typeof p === 'string' && p.startsWith('/') && !p.startsWith('//')).slice(0, 20)
    event.waitUntil(paths.reduce((chain, p) => chain.then(() => warmPage(p)), Promise.resolve()))
  }
})

function isLiveOnly(pathname) {
  return LIVE_ONLY.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

async function trimPages(cache) {
  const keys = await cache.keys()
  for (let i = 0; i < keys.length - MAX_PAGES; i++) await cache.delete(keys[i])
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE)
  const hit = await cache.match(request)
  if (hit) return hit
  const response = await fetch(request)
  if (response.ok && response.type === 'basic') cache.put(request, response.clone())
  return response
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE)
  const hit = await cache.match(request)
  const network = fetch(request)
    .then((response) => {
      if (response.ok && response.type === 'basic') cache.put(request, response.clone())
      return response
    })
    .catch(() => hit)
  return hit || network
}

async function pageNetworkFirst(request, url) {
  const cache = await caches.open(PAGES_CACHE)
  try {
    const response = await fetch(request)
    const type = response.headers.get('content-type') || ''
    if (response.ok && !response.redirected && response.type === 'basic' && type.includes('text/html')) {
      // Keyed by path, so /projects/x/daily-logs?saved=1 still opens /projects/x/daily-logs offline.
      const copy = response.clone()
      cache.put(url.pathname, copy).then(() => trimPages(cache))
      response
        .clone()
        .text()
        .then(cacheAssetsOf)
        .catch(() => {})
    }
    return response
  } catch {
    const hit = (await cache.match(request)) || (await cache.match(url.pathname))
    if (hit) return hit
    return (await caches.match(OFFLINE_URL)) || Response.error()
  }
}

async function liveWithOfflineFallback(request) {
  try {
    return await fetch(request)
  } catch {
    return (await caches.match(OFFLINE_URL)) || Response.error()
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request))
    return
  }
  if (/^\/(icons|branding|images)\//.test(url.pathname) || url.pathname === '/icon.svg' || url.pathname === '/apple-icon.png') {
    event.respondWith(staleWhileRevalidate(request))
    return
  }
  if (request.mode === 'navigate') {
    event.respondWith(isLiveOnly(url.pathname) ? liveWithOfflineFallback(request) : pageNetworkFirst(request, url))
  }
  // Everything else (data requests, images from storage, prefetches) goes straight to the network.
})
