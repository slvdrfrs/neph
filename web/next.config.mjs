/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      // Iconos de rangos, agentes y mapas
      { protocol: 'https', hostname: 'media.valorant-api.com' }
    ]
  }
}

export default nextConfig
