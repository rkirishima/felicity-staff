'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

export default function TimeclockPage() {
  const [staffList, setStaffList] = useState<any[]>([])
  const [selectedStaff, setSelectedStaff] = useState('')
  const [date, setDate] = useState('')
  const [clockIn, setClockIn] = useState('')
  const [clockOut, setClockOut] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [requests, setRequests] = useState<any[]>([])
  const supabase = createClient()

  useEffect(() => {
    supabase.from('staff').select('id, name').eq('active', true).not('role', 'eq', 'accountant').order('name')
      .then(({ data }) => setStaffList(data ?? []))
    loadRequests()
  }, [])

  async function loadRequests() {
    const { data } = await supabase.from('timeclock_requests')
      .select('*, staff(name)').order('created_at', { ascending: false }).limit(10)
    setRequests(data ?? [])
  }

  async function submit() {
    if (!selectedStaff || !date || !clockIn) { toast.error('スタッフ・日付・出勤時間は必須です'); return }
    setLoading(true)
    const { error } = await supabase.from('timeclock_requests').insert({
      staff_id: selectedStaff, date, clock_in: clockIn, clock_out: clockOut || null, reason,
    })
    if (error) { toast.error('エラー: ' + error.message); setLoading(false); return }
    toast.success('修正リクエストを送信しました！桐島に確認してもらいます。')
    setDate(''); setClockIn(''); setClockOut(''); setReason('')
    setLoading(false); loadRequests()
  }

  return (
    <main className="min-h-screen p-4 max-w-lg mx-auto pb-24" style={{ backgroundColor: '#F5F0E8' }}>
      <h1 className="text-lg font-bold tracking-widest text-stone-800 mb-1">打刻修正リクエスト</h1>
      <p className="text-xs text-stone-400 mb-6">押し忘れ・間違いをここから申請してください</p>

      <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3 mb-6">
        <div>
          <p className="text-xs text-stone-400 mb-1">スタッフ</p>
          <select value={selectedStaff} onChange={e => setSelectedStaff(e.target.value)}
            className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm bg-white text-stone-700">
            <option value="">選択してください</option>
            {staffList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <p className="text-xs text-stone-400 mb-1">日付</p>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm bg-white" />
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <p className="text-xs text-stone-400 mb-1">出勤時間</p>
            <input type="time" value={clockIn} onChange={e => setClockIn(e.target.value)}
              className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm bg-white" />
          </div>
          <div className="flex-1">
            <p className="text-xs text-stone-400 mb-1">退勤時間（任意）</p>
            <input type="time" value={clockOut} onChange={e => setClockOut(e.target.value)}
              className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm bg-white" />
          </div>
        </div>
        <div>
          <p className="text-xs text-stone-400 mb-1">理由</p>
          <input type="text" value={reason} onChange={e => setReason(e.target.value)}
            placeholder="例：出勤時に押し忘れました"
            className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm bg-white" />
        </div>
        <button onClick={submit} disabled={loading}
          className="w-full py-3 bg-stone-800 text-white rounded-xl font-medium disabled:opacity-50">
          {loading ? '送信中...' : '修正リクエストを送信'}
        </button>
      </div>

      {requests.length > 0 && (
        <div>
          <p className="text-xs text-stone-400 mb-2">最近の申請</p>
          <div className="space-y-2">
            {requests.map(r => (
              <div key={r.id} className="bg-white rounded-xl px-4 py-3 shadow-sm">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium text-stone-700">{(r.staff as any)?.name}</p>
                    <p className="text-xs text-stone-400">{r.date} {r.clock_in}〜{r.clock_out || '?'}</p>
                    {r.reason && <p className="text-xs text-stone-400 mt-0.5">{r.reason}</p>}
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    r.status === 'approved' ? 'bg-teal-100 text-teal-700' :
                    r.status === 'rejected' ? 'bg-red-100 text-red-600' :
                    'bg-amber-100 text-amber-700'
                  }`}>
                    {r.status === 'approved' ? '承認済' : r.status === 'rejected' ? '却下' : '審査中'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <button onClick={() => window.history.back()} className="text-stone-400 text-xs mt-6 block">← 戻る</button>
    </main>
  )
}
