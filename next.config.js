/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['localhost', 'vercel.app'],
    formats: ['image/webp'],
  },
}

module.exports = nextConfig 