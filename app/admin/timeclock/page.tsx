'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { nextMonthFirstDay } from '@/lib/utils'
import { getAdminSession } from '@/lib/session'

export default function AdminTimeclockPage() {
  const [requests, setRequests] = useState<any[]>([])
  const [records, setRecords] = useState<any[]>([])
  const [tab, setTab] = useState<'requests' | 'records' | 'cost'>('records')
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
  })
  const [filterDate, setFilterDate] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editIn, setEditIn] = useState('')
  const [editOut, setEditOut] = useState('')
  const [editDate, setEditDate] = useState('')
  const [staffList, setStaffList] = useState<any[]>([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [addStaff, setAddStaff] = useState('')
  const [addDate, setAddDate] = useState('')
  const [addIn, setAddIn] = useState('')
  const [addOut, setAddOut] = useState('')
  const [costMonth, setCostMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
  })
  const [costSummary, setCostSummary] = useState<any[]>([])
  const [allTimeCost, setAllTimeCost] = useState(0)
  const [allTimeSummary, setAllTimeSummary] = useState<any[]>([])
  const [showAllTime, setShowAllTime] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    if (!getAdminSession()) {
      router.replace('/admin')
      return
    }
    loadRequests()
    loadRecords()
    loadAllTimeCost()
    supabase.from('staff').select('id, name').eq('active', true)
      .not('role', 'in', '("accountant","admin")').order('name')
      .then(({ data }) => setStaffList(data ?? []))
  }, [])

  useEffect(() => { loadRecords() }, [month])
  useEffect(() => { loadCostSummary(costMonth) }, [costMonth])

  async function loadRequests() {
    const { data } = await supabase.from('timeclock_requests')
      .select('*, staff(name)').eq('status', 'pending').order('created_at')
    setRequests(data ?? [])
  }

  async function loadRecords() {
    const { data } = await supabase.from('timeclock')
      .select('*, staff(name)')
      .gte('clock_in', `${month}-01T00:00:00+09:00`)
      .lt('clock_in', `${nextMonthFirstDay(month)}T00:00:00+09:00`)
      .order('clock_in', { ascending: false })
    setRecords(data ?? [])
  }

  async function loadCostSummary(targetMonth: string) {
    const { data: rows } = await supabase.from('timeclock')
      .select('staff_id, clock_in, clock_out, staff(name, hourly_rate)')
      .gte('clock_in', `${targetMonth}-01T00:00:00+09:00`)
      .lt('clock_in', `${nextMonthFirstDay(targetMonth)}T00:00:00+09:00`)
    const map: Record<string, any> = {}
    for (const r of (rows ?? [])) {
      const sid = r.staff_id
      if (!map[sid]) map[sid] = { name: (r.staff as any)?.name, hourly_rate: (r.staff as any)?.hourly_rate || 1300, hours: 0, days: 0 }
      if (r.clock_out) {
        const h = (new Date(r.clock_out).getTime() - new Date(r.clock_in).getTime()) / 3600000
        map[sid].hours += h
        map[sid].days += 1
      }
    }
    setCostSummary(Object.values(map).sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'ja')))
  }

  async function loadAllTimeCost() {
    const { data: rows } = await supabase.from('timeclock')
      .select('staff_id, clock_in, clock_out, staff(name, hourly_rate)')
      .not('clock_out', 'is', null)
    const map: Record<string, any> = {}
    let total = 0
    for (const r of (rows ?? [])) {
      const sid = r.staff_id
      const rate = (r.staff as any)?.hourly_rate || 1300
      if (!map[sid]) map[sid] = { name: (r.staff as any)?.name, rate, hours: 0 }
      if (r.clock_out) {
        const h = (new Date(r.clock_out).getTime() - new Date(r.clock_in).getTime()) / 3600000
        map[sid].hours += h
        total += h * rate
      }
    }
    setAllTimeCost(Math.round(total))
    setAllTimeSummary(Object.values(map).sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'ja')))
  }

  async function approveRequest(r: any) {
    await supabase.from('timeclock').insert({
      staff_id: r.staff_id,
      clock_in: `${r.date}T${r.clock_in}:00+09:00`,
      clock_out: r.clock_out ? `${r.date}T${r.clock_out}:00+09:00` : null,
    })
    await supabase.from('timeclock_requests').update({ status: 'approved' }).eq('id', r.id)
    toast.success('承認しました')
    loadRequests(); loadRecords()
  }

  async function rejectRequest(id: string) {
    await supabase.from('timeclock_requests').update({ status: 'rejected' }).eq('id', id)
    toast.success('却下しました')
    loadRequests()
  }

  function startEdit(r: any) {
    setEditId(r.id)
    setEditDate(new Date(r.clock_in).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' }).replace(/\//g,'-').replace(/(\d+)-(\d+)-(\d+)/, (_, y, m, d) => `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`))
    setEditIn(new Date(r.clock_in).toLocaleTimeString('ja-JP', { hour:'2-digit', minute:'2-digit', timeZone:'Asia/Tokyo' }))
    setEditOut(r.clock_out ? new Date(r.clock_out).toLocaleTimeString('ja-JP', { hour:'2-digit', minute:'2-digit', timeZone:'Asia/Tokyo' }) : '')
  }

  async function saveEdit(id: string) {
    const updates: any = {
      clock_in: `${editDate}T${editIn}:00+09:00`,
    }
    if (editOut) {
      updates.clock_out = `${editDate}T${editOut}:00+09:00`
    } else {
      updates.clock_out = null
    }
    const { error } = await supabase.from('timeclock').update(updates).eq('id', id)
    if (error) { toast.error('更新失敗: ' + error.message); return }
    toast.success('修正しました')
    setEditId(null); loadRecords()
  }

  async function deleteRecord(id: string) {
    if (!confirm('この打刻記録を削除しますか？')) return
    const { error } = await supabase.from('timeclock').delete().eq('id', id)
    if (error) { toast.error('削除失敗'); return }
    toast.success('削除しました')
    loadRecords()
  }

  async function addRecord() {
    if (!addStaff || !addDate || !addIn) { toast.error('スタッフ・日付・出勤時間は必須'); return }
    const { error } = await supabase.from('timeclock').insert({
      staff_id: addStaff,
      clock_in: `${addDate}T${addIn}:00+09:00`,
      clock_out: addOut ? `${addDate}T${addOut}:00+09:00` : null,
    })
    if (error) { toast.error('追加失敗: ' + error.message); return }
    toast.success('追加しました')
    setShowAddForm(false); setAddStaff(''); setAddDate(''); setAddIn(''); setAddOut('')
    loadRecords()
  }

  async function exportCSV() {
    const csv = '\uFEFF' + 'スタッフ,日付,出勤,退勤,労働時間\n' +
      records.map(r => {
        const cin = new Date(r.clock_in)
        const cout = r.clock_out ? new Date(r.clock_out) : null
        const hours = cout ? ((cout.getTime() - cin.getTime()) / 3600000).toFixed(2) : ''
        const date = cin.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' })
        const inTime = cin.toLocaleTimeString('ja-JP', { hour:'2-digit', minute:'2-digit', timeZone:'Asia/Tokyo' })
        const outTime = cout ? cout.toLocaleTimeString('ja-JP', { hour:'2-digit', minute:'2-digit', timeZone:'Asia/Tokyo' }) : ''
        return `${(r.staff as any)?.name},${date},${inTime},${outTime},${hours}`
      }).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `timeclock_${month}.csv`; a.click()
  }

  const TIME_OPTIONS: string[] = []
  for (let i = 0; i <= 28; i++) {
    const total = 8 * 60 + i * 30
    const h = String(Math.floor(total / 60)).padStart(2,'0')
    const m = String(total % 60).padStart(2,'0')
    TIME_OPTIONS.push(`${h}:${m}`)
  } // 08:00 〜 22:00

  return (
    <main className="min-h-screen p-4 max-w-lg mx-auto pb-24" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => router.push('/admin')} className="text-stone-400 text-lg">←</button>
        <h1 className="text-lg font-bold tracking-widest text-stone-800">タイムカード管理</h1>
      </div>

      <div className="flex gap-2 mb-4">
        <button onClick={() => setTab('records')}
          className={`flex-1 py-2 rounded-xl text-sm font-medium ${tab === 'records' ? 'bg-stone-800 text-white' : 'bg-white text-stone-500 shadow-sm'}`}>
          打刻記録
        </button>
        <button onClick={() => setTab('requests')}
          className={`flex-1 py-2 rounded-xl text-sm font-medium relative ${tab === 'requests' ? 'bg-stone-800 text-white' : 'bg-white text-stone-500 shadow-sm'}`}>
          修正
          {requests.length > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
              {requests.length}
            </span>
          )}
        </button>
        <button onClick={() => { setTab('cost'); loadCostSummary(costMonth) }}
          className={`flex-1 py-2 rounded-xl text-sm font-medium ${tab === 'cost' ? 'bg-stone-800 text-white' : 'bg-white text-stone-500 shadow-sm'}`}>
          コスト
        </button>
      </div>

      {/* 打刻記録タブ */}
      {tab === 'records' && (
        <>
          <div className="flex gap-2 mb-2">
            <input type="month" value={month} onChange={e => { setMonth(e.target.value); setFilterDate('') }}
              className="flex-1 border border-stone-200 rounded-xl px-3 py-2 text-sm bg-white text-stone-800" />
            <button onClick={exportCSV}
              className="px-4 py-2 bg-white border border-stone-200 rounded-xl text-sm text-stone-600 shadow-sm font-medium">
              CSV
            </button>
            <button onClick={() => setShowAddForm(!showAddForm)}
              className="px-4 py-2 bg-stone-800 text-white rounded-xl text-sm font-medium">
              ＋追加
            </button>
          </div>
          <div className="flex gap-2 mb-3">
            <input type="date" value={filterDate} onChange={e => {
              const d = e.target.value
              setFilterDate(d)
              if (d) setMonth(d.slice(0, 7))
            }}
              className="flex-1 border border-stone-200 rounded-xl px-3 py-2 text-sm bg-white text-stone-800" />
            {filterDate && (
              <button onClick={() => setFilterDate('')}
                className="px-3 py-2 bg-stone-100 text-stone-500 rounded-xl text-sm">
                クリア
              </button>
            )}
          </div>

          {/* 追加フォーム */}
          {showAddForm && (
            <div className="bg-white rounded-2xl shadow-sm p-4 mb-4 space-y-3">
              <p className="text-sm font-medium text-stone-700">打刻記録を追加</p>
              <select value={addStaff} onChange={e => setAddStaff(e.target.value)}
                className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm bg-white text-stone-800">
                <option value="">スタッフを選択</option>
                {staffList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <input type="date" value={addDate} onChange={e => setAddDate(e.target.value)}
                className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm bg-white text-stone-800" />
              <div className="flex gap-2">
                <select value={addIn} onChange={e => setAddIn(e.target.value)}
                  className="flex-1 border border-stone-200 rounded-xl px-3 py-2 text-sm bg-white text-stone-800">
                  <option value="">出勤時間</option>
                  {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <select value={addOut} onChange={e => setAddOut(e.target.value)}
                  className="flex-1 border border-stone-200 rounded-xl px-3 py-2 text-sm bg-white text-stone-800">
                  <option value="">退勤時間</option>
                  {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <button onClick={addRecord}
                  className="flex-1 py-2 bg-stone-800 text-white rounded-xl text-sm font-medium">追加</button>
                <button onClick={() => setShowAddForm(false)}
                  className="flex-1 py-2 bg-stone-100 text-stone-600 rounded-xl text-sm">キャンセル</button>
              </div>
            </div>
          )}

          {/* 記録一覧 */}
          <div className="space-y-2">
            {(() => {
              const filtered = filterDate
                ? records.filter(r => new Date(r.clock_in).toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }) === filterDate)
                : records
              return filtered
            })().length === 0 && records.length > 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center text-stone-400 text-sm shadow-sm">
                {filterDate}の記録はありません
              </div>
            ) : null}
            {records.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center text-stone-400 text-sm shadow-sm">
                記録がありません
              </div>
            ) : (filterDate ? records.filter(r => new Date(r.clock_in).toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }) === filterDate) : records).map(r => {
              const cin = new Date(r.clock_in)
              const cout = r.clock_out ? new Date(r.clock_out) : null
              const hours = cout ? ((cout.getTime() - cin.getTime()) / 3600000).toFixed(1) : null
              const isEditing = editId === r.id

              return (
                <div key={r.id} className="bg-white rounded-2xl shadow-sm px-4 py-3">
                  {isEditing ? (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-stone-700">{(r.staff as any)?.name}</p>
                      <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)}
                        className="w-full border border-stone-200 rounded-lg px-2 py-1.5 text-sm text-stone-800 bg-white" />
                      <div className="flex gap-2 items-center">
                        <select value={editIn} onChange={e => setEditIn(e.target.value)}
                          className="flex-1 border border-stone-200 rounded-lg px-2 py-1.5 text-sm text-stone-800 bg-white">
                          <option value="">出勤</option>
                          {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <span className="text-stone-400">〜</span>
                        <select value={editOut} onChange={e => setEditOut(e.target.value)}
                          className="flex-1 border border-stone-200 rounded-lg px-2 py-1.5 text-sm text-stone-800 bg-white">
                          <option value="">退勤</option>
                          {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => saveEdit(r.id)}
                          className="flex-1 py-2 bg-stone-800 text-white rounded-xl text-sm font-medium">保存</button>
                        <button onClick={() => setEditId(null)}
                          className="flex-1 py-2 bg-stone-100 text-stone-600 rounded-xl text-sm">キャンセル</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-stone-700">{(r.staff as any)?.name}</p>
                        <p className="text-xs text-stone-400 mt-0.5">
                          {cin.toLocaleDateString('ja-JP', { month:'numeric', day:'numeric', weekday:'short', timeZone:'Asia/Tokyo' })}{'　'}
                          {cin.toLocaleTimeString('ja-JP', { hour:'2-digit', minute:'2-digit', timeZone:'Asia/Tokyo' })}
                          〜{cout ? cout.toLocaleTimeString('ja-JP', { hour:'2-digit', minute:'2-digit', timeZone:'Asia/Tokyo' }) : '未退勤'}
                          {hours && <span className="ml-2 text-teal-600 font-medium">{hours}h</span>}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => startEdit(r)}
                          className="text-xs text-stone-500 px-2 py-1 bg-stone-100 rounded-lg hover:bg-stone-200">
                          編集
                        </button>
                        <button onClick={() => deleteRecord(r.id)}
                          className="text-xs text-red-500 px-2 py-1 bg-red-50 rounded-lg hover:bg-red-100">
                          削除
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* コスト集計タブ */}
      {tab === 'cost' && (
        <>
          {/* 累計コスト */}
          <div className="bg-stone-800 rounded-2xl p-4 mb-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-stone-400 tracking-wider">累計勤怠コスト（全期間）</p>
              <button onClick={() => setShowAllTime(!showAllTime)}
                className="text-xs text-stone-400 underline">
                {showAllTime ? '閉じる' : 'スタッフ別'}
              </button>
            </div>
            <p className="text-3xl font-light text-white mb-2">¥{allTimeCost.toLocaleString()}</p>
            {showAllTime && allTimeSummary.length > 0 && (
              <div className="border-t border-stone-700 pt-3 space-y-1.5">
                {allTimeSummary.map((s, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-sm text-stone-300">{s.name}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-stone-500">{s.hours.toFixed(1)}h</span>
                      <span className="text-sm text-stone-300">¥{Math.round(s.hours * s.rate).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 月別内訳 */}
          <div className="flex gap-2 mb-3">
            <input type="month" value={costMonth} onChange={e => setCostMonth(e.target.value)}
              className="flex-1 border border-stone-200 rounded-xl px-3 py-2 text-sm bg-white text-stone-800" />
          </div>

          {costSummary.length > 0 && (
            <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4 mb-3 text-center">
              <p className="text-xs text-teal-600 mb-1">{costMonth} 月次コスト</p>
              <p className="text-2xl font-medium text-teal-700">
                ¥{costSummary.reduce((sum, s) => sum + Math.round(s.hours * s.hourly_rate), 0).toLocaleString()}
              </p>
            </div>
          )}

          <div className="space-y-2">
            {costSummary.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center text-stone-400 text-sm shadow-sm">
                データがありません
              </div>
            ) : costSummary.map((s, i) => (
              <div key={i} className="bg-white rounded-2xl shadow-sm px-4 py-3">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-medium text-stone-800">{s.name}</p>
                    <p className="text-xs text-stone-400 mt-0.5">
                      {s.days}日 · {s.hours.toFixed(1)}h · ¥{(s.hourly_rate || 1300).toLocaleString()}/h
                    </p>
                  </div>
                  <p className="text-lg font-medium text-stone-800">
                    ¥{Math.round(s.hours * s.hourly_rate).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 修正リクエストタブ */}
      {tab === 'requests' && (
        <div className="space-y-3">
          {requests.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center text-stone-400 text-sm shadow-sm">
              修正リクエストはありません
            </div>
          ) : requests.map(r => (
            <div key={r.id} className="bg-white rounded-2xl shadow-sm p-4">
              <div className="mb-3">
                <p className="font-medium text-stone-800">{(r.staff as any)?.name}</p>
                <p className="text-xs text-stone-400 mt-0.5">
                  {r.date}　{r.clock_in}〜{r.clock_out || '?'}
                </p>
                {r.reason && (
                  <p className="text-xs text-amber-600 mt-1 bg-amber-50 px-2 py-1 rounded-lg">「{r.reason}」</p>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => approveRequest(r)}
                  className="flex-1 py-2.5 bg-teal-600 text-white rounded-xl text-sm font-medium">✓ 承認</button>
                <button onClick={() => rejectRequest(r.id)}
                  className="flex-1 py-2.5 bg-red-50 text-red-500 rounded-xl text-sm font-medium">✕ 却下</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
