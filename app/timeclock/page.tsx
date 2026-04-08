'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { getSession } from '@/lib/session'
import { useRouter } from 'next/navigation'

const TIME_OPTIONS: string[] = []
for (let i = 0; i <= 28; i++) {
  const total = 8 * 60 + i * 30
  const h = String(Math.floor(total / 60)).padStart(2, '0')
  const m = String(total % 60).padStart(2, '0')
  TIME_OPTIONS.push(`${h}:${m}`)
}

function TimeclockContent() {
  const [staffId, setStaffId] = useState('')
  const [staffName, setStaffName] = useState('')
  const [date, setDate] = useState('')
  const [clockIn, setClockIn] = useState('')
  const [clockOut, setClockOut] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [myRequests, setMyRequests] = useState<any[]>([])
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    // セッションからスタッフ情報を取得
    const session = getSession()
    if (session && session.staffRole !== 'admin') {
      setStaffId(session.staffId)
      setStaffName(session.staffName)
      loadMyRequests(session.staffId)
    } else {
      // セッションがない場合はホームにリダイレクト
      router.replace('/')
      return
    }
    // 今日の日付をデフォルトに
    const today = new Date(Date.now() + 9*60*60*1000).toISOString().slice(0, 10)
    setDate(today)
  }, [])

  async function loadMyRequests(sid: string) {
    const { data } = await supabase.from('timeclock_requests')
      .select('*').eq('staff_id', sid).order('created_at', { ascending: false }).limit(5)
    setMyRequests(data ?? [])
  }

  async function submit() {
    const sid = staffId
    if (!sid || !date || !clockIn) { toast.error('スタッフ・日付・出勤時間は必須です'); return }
    setLoading(true)
    const { error } = await supabase.from('timeclock_requests').insert({
      staff_id: sid,
      date,
      clock_in: clockIn,
      clock_out: clockOut || null,
      reason: reason || '修正リクエスト',
      status: 'pending',
    })
    if (error) { toast.error('送信失敗: ' + error.message); setLoading(false); return }
    toast.success('修正リクエストを送信しました！桐島が確認します。')
    setSubmitted(true)
    setLoading(false)
    if (staffId) loadMyRequests(staffId)
  }

  const STATUS_LABEL: Record<string, string> = {
    pending: '⏳ 確認待ち',
    approved: '✅ 承認済み',
    rejected: '❌ 却下',
  }

  if (submitted) return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-6" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="text-5xl">📨</div>
      <div className="text-center">
        <p className="text-xl font-medium text-stone-800">送信完了！</p>
        <p className="text-stone-400 text-sm mt-1">桐島が確認次第、修正します。</p>
      </div>
      <button onClick={() => router.back()}
        className="px-6 py-3 bg-stone-800 text-white rounded-2xl text-sm font-medium">
        ← 戻る
      </button>
    </main>
  )

  return (
    <main className="min-h-screen p-4 max-w-lg mx-auto pb-24" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-stone-400 text-lg">←</button>
        <h1 className="text-lg font-bold tracking-widest text-stone-800">打刻修正リクエスト</h1>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4 mb-6">
        {staffName && (
          <p className="text-sm font-medium text-stone-700">{staffName}</p>
        )}

        <div>
          <p className="text-xs text-stone-400 mb-2">日付</p>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm bg-white text-stone-800" />
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <p className="text-xs text-stone-400 mb-2">出勤時間</p>
            <select value={clockIn} onChange={e => setClockIn(e.target.value)}
              className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm bg-white text-stone-800">
              <option value="">選択</option>
              {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <p className="text-xs text-stone-400 mb-2">退勤時間</p>
            <select value={clockOut} onChange={e => setClockOut(e.target.value)}
              className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm bg-white text-stone-800">
              <option value="">選択</option>
              {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        <div>
          <p className="text-xs text-stone-400 mb-2">理由（任意）</p>
          <input type="text" value={reason} onChange={e => setReason(e.target.value)}
            placeholder="例：打刻忘れ、GPS不具合など"
            className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm bg-white text-stone-800" />
        </div>

        <button onClick={submit} disabled={loading}
          className="w-full py-3 bg-stone-800 text-white rounded-xl font-medium text-sm disabled:opacity-50">
          {loading ? '送信中...' : '修正リクエストを送信'}
        </button>
      </div>

      {/* 過去のリクエスト */}
      {myRequests.length > 0 && (
        <div>
          <p className="text-xs text-stone-400 mb-2">過去のリクエスト</p>
          <div className="space-y-2">
            {myRequests.map(r => (
              <div key={r.id} className="bg-white rounded-xl px-4 py-3 shadow-sm">
                <div className="flex justify-between items-center">
                  <p className="text-sm text-stone-700">{r.date} {r.clock_in}〜{r.clock_out || '?'}</p>
                  <span className="text-xs">{STATUS_LABEL[r.status] || r.status}</span>
                </div>
                {r.reason && <p className="text-xs text-stone-400 mt-0.5">「{r.reason}」</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  )
}

export default function TimeclockPage() {
  return <Suspense><TimeclockContent /></Suspense>
}
