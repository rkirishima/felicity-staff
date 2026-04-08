'use client'
import { useEffect, useState } from 'react'

const CLIENT_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? '1.6'

export default function VersionChecker() {
  const [outdated, setOutdated] = useState(false)

  async function check() {
    try {
      const res = await fetch('/api/version', { cache: 'no-store' })
      if (!res.ok) return
      const { version } = await res.json()
      if (version && version !== CLIENT_VERSION) setOutdated(true)
    } catch {
      // ネットワークエラーは無視
    }
  }

  useEffect(() => {
    check()
    const onFocus = () => check()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  if (!outdated) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-teal-600 text-white text-center py-3 px-4 text-sm font-medium shadow-lg">
      アプリが更新されました 🎉
      <button
        onClick={() => window.location.reload()}
        className="ml-3 underline font-bold"
      >
        タップして最新版を読み込む
      </button>
    </div>
  )
}
