'use client'

// 画面を描く前に DB 通行証を用意する。権限がない（ログイン前）場合もそのまま描く。
// 日付が変わってログインが切れたときのため、アプリに戻ってきたときにも確認し直す。
import { useEffect, useState } from 'react'
import { ensureDbPass } from '@/lib/supabase/db-pass-client'

export default function DbPassGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let alive = true
    // 通信が詰まっても画面が出ないままにはしない
    const fallback = setTimeout(() => { if (alive) setReady(true) }, 4000)
    ensureDbPass().finally(() => {
      clearTimeout(fallback)
      if (alive) setReady(true)
    })
    const onVisible = () => { if (document.visibilityState === 'visible') ensureDbPass() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      clearTimeout(fallback)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  if (!ready) return null
  return <>{children}</>
}
