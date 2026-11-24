import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  // イベント QR 用の短縮 URL。移転時はここの destination だけ変えれば QR はそのまま使える。
  redirects: async () => [
    { source: '/yalda', destination: '/events/persian-dinner', permanent: false },
  ],
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        { key: 'Pragma', value: 'no-cache' },
      ],
    },
  ],
}

export default nextConfig
