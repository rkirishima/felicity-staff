import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import BottomNav from '@/components/BottomNav'
import AdminNav from '@/components/AdminNav'
import { AdminProvider } from '@/lib/admin-context'
import { Toaster } from '@/components/ui/sonner'

const geist = Geist({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Felicity Staff',
  description: 'Felicity Cafe Staff Platform',
  manifest: '/manifest.json',
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
        </AdminProvider>
      </body>
    </html>
  )
}
