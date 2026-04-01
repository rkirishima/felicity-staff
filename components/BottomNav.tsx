'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const items = [
  { href: '/', label: '打刻', icon: '⏱' },
  { href: '/schedule', label: 'シフト', icon: '📅' },
  { href: '/hygiene', label: '衛生', icon: '✅' },
  { href: '/operations', label: '作業', icon: '📋' },
  { href: '/recipes', label: 'レシピ', icon: '☕' },
]

export default function BottomNav() {
  const path = usePathname()
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-zinc-900 border-t border-zinc-800 flex z-50">
      {items.map(item => (
        <Link key={item.href} href={item.href}
          className={`flex-1 flex flex-col items-center py-3 text-xs transition-colors ${
            path === item.href ? 'text-teal-400' : 'text-zinc-500 hover:text-zinc-300'
          }`}>
          <span className="text-lg">{item.icon}</span>
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  )
}
