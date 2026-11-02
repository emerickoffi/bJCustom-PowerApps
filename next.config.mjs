/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  experimental: {
    serverActions: {
      // Warranty claims accept up to 6 attachments of 15 MB each; the default 1 MB limit rejects most phone photos.
      bodySizeLimit: '95mb',
    },
  },
  // Next 16.4 strict matching rejects pages outside (staff) because the staff-level @modal slot has no sibling there; loose matching restores the pre-16.4 behavior these routes rely on.
  deprecated: {
    looseRouteMatching: true,
  },
}

export default nextConfig
