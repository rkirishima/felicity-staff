'use client'

// 店舗に置きっぱなしの iPad / Mac を「店舗端末」として登録する。
// 登録した端末は、PIN ログインしていなくても注文通知などが動き続ける（1年有効）。
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { getDeviceStatus, registerThisDevice, unregisterThisDevice } from '@/app/db-pass/actions'
import { ensureDbPass } from '@/lib/supabase/db-pass-client'

export default function DeviceRegistration() {
  const [registered, setRegistered] = useState<boolean | null>(null)

  useEffect(() => { getDeviceStatus().then(setRegistered) }, [])

  async function toggle() {
    if (registered) {
      if (!confirm('この端末の店舗端末登録を解除しますか？')) return
      const ok = await unregisterThisDevice()
      if (!ok) { toast.error('解除できませんでした'); return }
      setRegistered(false)
      toast.success('登録を解除しました')
    } else {
      const ok = await registerThisDevice()
      if (!ok) { toast.error('登録できませんでした（管理者でログインしてください）'); return }
      await ensureDbPass()
      setRegistered(true)
      toast.success('この端末を店舗端末に登録しました')
    }
  }

  if (registered === null) return null
  return (
    <div className="w-full max-w-sm rounded-2xl bg-white/60 px-5 py-4 shadow-sm">
      <p className="text-sm font-medium text-stone-700">
        {registered ? '✅ この端末は店舗端末です' : 'この端末は店舗端末ではありません'}
      </p>
      <p className="mt-1 text-xs text-stone-400">
        店舗の iPad・Mac は登録しておくと、ログインしていなくても注文通知などが動きます。
      </p>
      <button onClick={toggle} className="mt-3 text-xs text-teal-700 underline">
        {registered ? '登録を解除する' : 'この端末を店舗端末に登録する'}
      </button>
    </div>
  )
}
