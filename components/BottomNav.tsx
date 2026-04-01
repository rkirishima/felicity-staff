'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Clock, CalendarDays, ShieldCheck, ClipboardList, BookOpen } from 'lucide-react'

const items = [
  { href: '/', label: '打刻', icon: Clock },
  { href: '/schedule', label: 'シフト', icon: CalendarDays },
  { href: '/hygiene', label: '衛生', icon: ShieldCheck },
  { href: '/operations', label: '作業', icon: ClipboardList },
  { href: '/recipes', label: 'レシピ', icon: BookOpen },
]

export default function BottomNav() {
  const path = usePathname()
  return (
    <nav className="fixed bottom-0 left-0 right-0 flex z-50"
      style={{ backgroundColor: '#F5F0E8', borderTop: '1px solid #E5DDD0' }}>
      {items.map(({ href, label, icon: Icon }) => {
        const active = path === href
        return (
          <Link key={href} href={href}
            className="flex-1 flex flex-col items-center py-3 gap-1 transition-colors"
            style={{ color: active ? '#292524' : '#A8A29E' }}>
            <Icon size={20} strokeWidth={active ? 2 : 1.5} />
            <span className="text-[10px] tracking-wider">{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
