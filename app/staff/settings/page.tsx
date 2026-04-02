'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

function SettingsContent() {
  const router = useRouter()
  const [staffList, setStaffList] = useState<any[]>([])
  const [staffId, setStaffId] = useState('')
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    supabase.from('staff').select('id, name').eq('active', true)
      .not('role', 'eq', 'accountant').order('name')
      .then(({ data }) => setStaffList(data ?? []))
  }, [])

  async function changePin() {
    if (!staffId) { toast.error('スタッフを選択してください'); return }
    if (newPin.length !== 4) { toast.error('PINは4桁で入力してください'); return }
    if (newPin !== confirmPin) { toast.error('PINが一致しません'); return }
    setLoading(true)
    const { data } = await supabase.from('staff').select('pin').eq('id', staffId).single()
    if (currentPin !== (data?.pin || '1234')) {
      toast.error('現在のPINが違います'); setLoading(false); return
    }
    await supabase.from('staff').update({ pin: newPin }).eq('id', staffId)
    toast.success('PINを変更しました！')
    setCurrentPin(''); setNewPin(''); setConfirmPin('')
    setLoading(false)
  }

  return (
    <main className="min-h-screen p-4 max-w-lg mx-auto pb-24" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-stone-400">←</button>
        <h1 className="text-lg font-bold tracking-widest text-stone-800">PIN変更</h1>
      </div>
      <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
        <div>
          <p className="text-xs text-stone-400 mb-1">スタッフ</p>
          <select value={staffId} onChange={e => setStaffId(e.target.value)}
            className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm bg-white">
            <option value="">選択してください</option>
            {staffList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        {[
          { label: '現在のPIN', val: currentPin, set: setCurrentPin, ph: '現在の4桁PIN' },
          { label: '新しいPIN', val: newPin, set: setNewPin, ph: '新しい4桁PIN' },
          { label: '確認', val: confirmPin, set: setConfirmPin, ph: 'もう一度入力' },
        ].map(({ label, val, set, ph }) => (
          <div key={label}>
            <p className="text-xs text-stone-400 mb-1">{label}</p>
            <input type="password" inputMode="numeric" maxLength={4} value={val}
              onChange={e => set(e.target.value)} placeholder={ph}
              className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm bg-white" />
          </div>
        ))}
        <button onClick={changePin} disabled={loading}
          className="w-full py-3 bg-stone-800 text-white rounded-xl font-medium disabled:opacity-50">
          {loading ? '変更中...' : 'PINを変更する'}
        </button>
      </div>
    </main>
  )
}

export default function SettingsPage() {
  return <Suspense><SettingsContent /></Suspense>
}
