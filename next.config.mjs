/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Next 16.4 strict matching rejects pages outside (staff) because the staff-level @modal slot has no sibling there; loose matching restores the pre-16.4 behavior these routes rely on.
  deprecated: {
    looseRouteMatching: true,
  },
}

export default nextConfig
