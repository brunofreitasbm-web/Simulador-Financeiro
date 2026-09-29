import type { NextConfig } from 'next'

const config: NextConfig = {
  transpilePackages: ['@sf/engine'],
  typedRoutes: false,
}

export default config
