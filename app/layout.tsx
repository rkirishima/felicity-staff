import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import BottomNav from '@/components/BottomNav'
import AdminNav from '@/components/AdminNav'
import { AdminProvider } from '@/lib/admin-context'
import { Toaster } from '@/components/ui/sonner'
import OrderNotification from '@/components/OrderNotification'
import VersionChecker from '@/components/VersionChecker'

const geist = Geist({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Felicity Staff',
  description: 'Felicity Cafe Staff Platform',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Felicity',
  },
  icons: {
    apple: '/felicity-logo.png',
  },
}

// viewport-fit=cover を有効化して env(safe-area-inset-*) を機能させる（ノッチ対応）
export const viewport: Viewport = {
  themeColor: '#1c1917',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className={geist.className + ' bg-zinc-950 text-white'}>
        <AdminProvider>
          <div className="pb-20">{children}</div>
          <BottomNav />
          <AdminNav />
          <Toaster />
          <OrderNotification />
          <VersionChecker />
        </AdminProvider>
      </body>
    </html>
  )
}
