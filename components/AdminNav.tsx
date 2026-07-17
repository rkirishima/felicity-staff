'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, CalendarDays, Clock, Tag, Users, CalendarCheck, Sparkles, Boxes } from 'lucide-react'
import { useIsAdmin } from '@/lib/admin-context'

const items = [
  { href: '/admin', label: 'ホーム', icon: LayoutDashboard },
  { href: '/admin/reservations', label: '予約', icon: CalendarCheck },
  { href: '/admin/events', label: 'イベント', icon: Sparkles },
  { href: '/admin/shifts', label: 'シフト', icon: CalendarDays },
  { href: '/admin/timeclock', label: 'タイムカード', icon: Clock },
  { href: '/inventory', label: '在庫', icon: Boxes },
  { href: '/label', label: 'ラベル', icon: Tag },
  { href: '/admin/payroll', label: 'スタッフ', icon: Users },
]

export default function AdminNav() {
  const path = usePathname()
  const isAdmin = useIsAdmin()
  if (!path.startsWith('/admin') && !isAdmin) return null
  return (
    <nav className="fixed bottom-0 left-0 right-0 flex z-50 bg-stone-100/95 backdrop-blur-sm border-t border-stone-200"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {items.map(({ href, label, icon: Icon }) => {
        const active = href === '/admin'
          ? (path === '/admin' || path === '/admin/live')
          : path.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className={`flex-1 flex flex-col items-center py-3 gap-1 transition-colors ${
              active ? 'text-emerald-600' : 'text-stone-500'
            }`}
          >
            <Icon size={20} strokeWidth={active ? 2 : 1.5} />
            <span className="text-[10px] tracking-wider">{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
