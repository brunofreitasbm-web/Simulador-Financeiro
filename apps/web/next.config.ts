import type { NextConfig } from 'next'

const config: NextConfig = {
  transpilePackages: ['@sf/engine'],
  typedRoutes: false,
  // Sistema privado (dados financeiros das empresas): nunca em buscador.
  async headers() {
    return [{ source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive, nosnippet' }] }]
  },
}

export default config
