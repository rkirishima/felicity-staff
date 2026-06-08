'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { getAdminSession } from '@/lib/session'
import { LOCATION_META, SHIFT_LOCATION_OPTIONS, locationOf, type ShiftLocation } from '@/lib/shift-locations'

const MONTHS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']
const DAYS = ['日','月','火','水','木','金','土']
// 既定のキッチンカー営業時間（一括生成のデフォルト）
const KITCHEN_CAR_DEFAULT_START = '10:00'
const KITCHEN_CAR_DEFAULT_END = '15:00'

const TIME_OPTIONS: string[] = []
for (let i = 0; i <= 28; i++) {
  const total = 8 * 60 + i * 30
  const h = String(Math.floor(total / 60)).padStart(2,'0')
  const m = String(total % 60).padStart(2,'0')
  TIME_OPTIONS.push(`${h}:${m}`)
}

export default function AdminShiftsPage() {
  const [tab, setTab] = useState<'calendar' | 'requests'>('calendar')
  const [viewMonth, setViewMonth] = useState(new Date())
  const [shifts, setShifts] = useState<any[]>([])
  const [pending, setPending] = useState<any[]>([])
  const [staffList, setStaffList] = useState<any[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [addStaff, setAddStaff] = useState('')
  const [addStart, setAddStart] = useState('')
  const [addEnd, setAddEnd] = useState('')
  const [addLocation, setAddLocation] = useState<ShiftLocation>('cafe')
  const [loading, setLoading] = useState(false)
  // キッチンカー一括登録（日ごとに担当・時間を変えられる）
  type BulkRow = {
    id: string
    date: string
    staffId: string
    startTime: string
    endTime: string
    include: boolean
  }
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([])
  const [bulkLoading, setBulkLoading] = useState(false)
  const [showBulk, setShowBulk] = useState(false)
  const [extraDate, setExtraDate] = useState('')
  // AIシフト提案（フェーズ1：申請プールへの助言）
  type AiRec = { id: string; action: 'approve' | 'hold'; reason: string }
  type AiResult = { summary: string; recommendations: AiRec[]; warnings: string[] }
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult] = useState<AiResult | null>(null)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    if (!getAdminSession()) { router.replace('/admin'); return }
    supabase.from('staff').select('id, name, role')
      .eq('active', true).not('role', 'in', '("accountant")')
      .order('name').then(({ data }) => setStaffList(data ?? []))
  }, [])

  useEffect(() => { loadShifts(); loadPending() }, [viewMonth])

  async function loadShifts() {
    const y = viewMonth.getFullYear()
    const m = String(viewMonth.getMonth() + 1).padStart(2,'0')
    const last = new Date(y, viewMonth.getMonth() + 1, 0).getDate()
    const { data, error } = await supabase.from('shifts')
      .select('id, staff_id, date, start_time, end_time, status, location, note')
      .gte('date', `${y}-${m}-01`)
      .lte('date', `${y}-${m}-${last}`)
      .order('date')
    if (error) { console.error(error); return }
    // staffの名前を取得
    const { data: staffData } = await supabase.from('staff').select('id, name')
    const staffMap: Record<string, string> = {}
    ;(staffData ?? []).forEach((s: any) => { staffMap[s.id] = s.name })
    setShifts((data ?? []).map((sh: any) => ({
      ...sh,
      staffName: sh.staff_id ? (staffMap[sh.staff_id] ?? '') : '募集中',
      isOpen: !sh.staff_id,
    })))
  }

  async function loadPending() {
    const { data, error } = await supabase.from('shifts')
      .select('id, staff_id, date, start_time, end_time, status, location, template_id')
      .eq('status', 'pending').order('date')
    if (error) { console.error(error); return }
    const { data: staffData } = await supabase.from('staff').select('id, name')
    const staffMap: Record<string, string> = {}
    ;(staffData ?? []).forEach((s: any) => { staffMap[s.id] = s.name })
    setPending((data ?? []).map((sh: any) => ({ ...sh, staffName: staffMap[sh.staff_id] ?? '' })))
  }

  async function addShift() {
    if (!selectedDate || !addStaff || !addStart || !addEnd) {
      toast.error('スタッフ・時間を選んでください'); return
    }
    setLoading(true)
    const { error } = await supabase.from('shifts').insert({
      staff_id: addStaff,
      date: selectedDate,
      start_time: addStart,
      end_time: addEnd,
      status: 'approved',
      location: addLocation,
    })
    if (error) { toast.error('追加失敗: ' + error.message); setLoading(false); return }
    toast.success('シフトを追加しました')
    setAddStaff(''); setAddStart(''); setAddEnd(''); setAddLocation('cafe')
    setLoading(false)
    loadShifts()
  }

  // 曜日ごとのデフォルト担当（前回登録した担当を覚えておく）
  function getDowDefault(dow: number): string {
    if (typeof window === 'undefined') return ''
    return localStorage.getItem(`felicity_kitchencar_dow_${dow}`) ?? ''
  }
  function saveDowDefault(dow: number, staffId: string) {
    if (typeof window === 'undefined' || !staffId) return
    localStorage.setItem(`felicity_kitchencar_dow_${dow}`, staffId)
  }

  // 表示月の水・木を初期行として生成
  function generateBulkRows(): BulkRow[] {
    const yy = viewMonth.getFullYear()
    const mm = viewMonth.getMonth()
    const last = new Date(yy, mm + 1, 0).getDate()
    const rows: BulkRow[] = []
    for (let day = 1; day <= last; day++) {
      const d = new Date(yy, mm, day)
      const dow = d.getDay()
      if (dow !== 3 && dow !== 4) continue // 水=3, 木=4
      const dateStr = `${yy}-${String(mm + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
      rows.push({
        id: dateStr,
        date: dateStr,
        staffId: getDowDefault(dow),
        startTime: KITCHEN_CAR_DEFAULT_START,
        endTime: KITCHEN_CAR_DEFAULT_END,
        include: true,
      })
    }
    return rows
  }

  // パネルを開いた時 or 月を切り替えた時に行を再生成
  useEffect(() => {
    if (!showBulk) return
    setBulkRows(generateBulkRows())
  }, [showBulk, viewMonth])

  function updateBulkRow(id: string, patch: Partial<BulkRow>) {
    setBulkRows(rows => rows.map(r => r.id === id ? { ...r, ...patch } : r))
  }
  function removeBulkRow(id: string) {
    setBulkRows(rows => rows.filter(r => r.id !== id))
  }
  function addExtraBulkRow() {
    if (!extraDate) return
    if (bulkRows.some(r => r.date === extraDate)) {
      toast.error('その日付は既にリストにあります')
      return
    }
    const dow = new Date(extraDate + 'T12:00:00').getDay()
    const newRow: BulkRow = {
      id: `${extraDate}-${Date.now()}`,
      date: extraDate,
      staffId: getDowDefault(dow),
      startTime: KITCHEN_CAR_DEFAULT_START,
      endTime: KITCHEN_CAR_DEFAULT_END,
      include: true,
    }
    setBulkRows(rows => [...rows, newRow].sort((a, b) => a.date.localeCompare(b.date)))
    setExtraDate('')
  }

  async function submitBulkRows() {
    const checked = bulkRows.filter(r => r.include && r.staffId)
    if (checked.length === 0) {
      toast.error('チェック中で担当者が選ばれている行がありません')
      return
    }
    setBulkLoading(true)
    // 同日・同スタッフのキッチンカーシフトが既にあればスキップ
    const existing = new Set(
      shifts
        .filter(s => locationOf(s) === 'kitchen_car')
        .map(s => `${s.date}|${s.staff_id}`)
    )
    const toInsert = checked
      .filter(r => !existing.has(`${r.date}|${r.staffId}`))
      .map(r => ({
        staff_id: r.staffId,
        date: r.date,
        start_time: r.startTime,
        end_time: r.endTime,
        status: 'approved',
        location: 'kitchen_car',
      }))
    if (toInsert.length === 0) {
      toast.info('全行が既に登録済みでした')
      setBulkLoading(false); return
    }
    const { error } = await supabase.from('shifts').insert(toInsert)
    if (error) { toast.error('一括追加失敗: ' + error.message); setBulkLoading(false); return }
    // 曜日ごとのデフォルト担当を更新（最後にそのdowで使った人）
    for (const r of checked) {
      const dow = new Date(r.date + 'T12:00:00').getDay()
      saveDowDefault(dow, r.staffId)
    }
    const skipped = checked.length - toInsert.length
    toast.success(skipped > 0
      ? `${toInsert.length}件追加（${skipped}件は既存のためスキップ）`
      : `${toInsert.length}件のキッチンカーシフトを追加しました`)
    setBulkLoading(false)
    setShowBulk(false)
    loadShifts()
  }

  async function deleteShift(id: string) {
    if (!confirm('このシフトを削除しますか？')) return
    const { error } = await supabase.from('shifts').delete().eq('id', id)
    if (error) { toast.error('削除失敗'); return }
    toast.success('削除しました')
    loadShifts()
  }

  async function approveRequest(id: string, opts: { reload?: boolean } = {}) {
    const { reload = true } = opts
    // 承認対象のシフト情報を取得
    const target = pending.find(p => p.id === id)
    await supabase.from('shifts').update({ status: 'approved' }).eq('id', id)
    // 対応する募集枠を1件削除（template_id 優先、なければ時間一致でフォールバック）
    if (target) {
      let openings: { id: string }[] | null = null
      if (target.template_id) {
        const { data } = await supabase.from('shifts')
          .select('id')
          .eq('date', target.date)
          .eq('template_id', target.template_id)
          .is('staff_id', null)
          .eq('status', 'approved')
          .limit(1)
        openings = data
      }
      if (!openings || openings.length === 0) {
        const { data } = await supabase.from('shifts')
          .select('id')
          .eq('date', target.date)
          .eq('start_time', target.start_time)
          .eq('end_time', target.end_time)
          .is('staff_id', null)
          .eq('status', 'approved')
          .limit(1)
        openings = data
      }
      if (openings && openings.length > 0) {
        await supabase.from('shifts').delete().eq('id', openings[0].id)
      }
    }
    if (reload) { toast.success('承認しました'); loadPending(); loadShifts() }
  }

  async function rejectRequest(id: string) {
    await supabase.from('shifts').update({ status: 'rejected' }).eq('id', id)
    toast.success('却下しました')
    loadPending()
  }

  // AIにシフト申請プールを見てもらい、承認の助言を受け取る（フェーズ1）
  async function runAiSuggest() {
    if (pending.length === 0) { toast.error('承認待ちの申請がありません'); return }
    setAiLoading(true)
    setAiResult(null)
    try {
      const approved = shifts
        .filter(s => s.status === 'approved')
        .map(s => ({
          staffName: s.isOpen ? '募集中' : s.staffName,
          date: s.date, start_time: s.start_time, end_time: s.end_time, location: s.location,
        }))
      const res = await fetch('/api/shifts/ai-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: `${y}-${String(m + 1).padStart(2, '0')}`,
          pending: pending.map(p => ({
            id: p.id, staffName: p.staffName, date: p.date,
            start_time: p.start_time, end_time: p.end_time, location: p.location,
          })),
          approved,
          staff: staffList.map(s => ({ name: s.name, role: s.role })),
        }),
      })
      const json = await res.json()
      if (!json.ok) { toast.error(json.error || 'AI提案に失敗しました'); return }
      setAiResult(json.result as AiResult)
      toast.success('AIの提案ができました 🤖')
    } catch (e) {
      toast.error('通信エラー: ' + (e as Error).message)
    } finally {
      setAiLoading(false)
    }
  }

  // AIが「承認おすすめ」とした申請をまとめて承認
  async function approveRecommended() {
    if (!aiResult) return
    const ids = aiResult.recommendations.filter(r => r.action === 'approve').map(r => r.id)
    const targets = pending.filter(p => ids.includes(p.id))
    if (targets.length === 0) { toast.error('おすすめの承認対象がありません'); return }
    for (const t of targets) {
      await approveRequest(t.id, { reload: false })
    }
    toast.success(`${targets.length}件をまとめて承認しました`)
    setAiResult(null)
    loadPending(); loadShifts()
  }

  const y = viewMonth.getFullYear()
  const m = viewMonth.getMonth()
  const firstDay = new Date(y, m, 1).getDay()
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  const cells = [...Array(firstDay).fill(null), ...Array.from({length: daysInMonth}, (_,i) => i+1)]

  return (
    <main className="min-h-screen p-4 max-w-lg mx-auto pb-24" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => router.push('/admin')} className="text-stone-400 text-lg">←</button>
        <h1 className="text-lg font-bold tracking-widest text-stone-800">シフト管理</h1>
      </div>

      <div className="flex gap-2 mb-4">
        <button onClick={() => setTab('calendar')}
          className={`flex-1 py-2 rounded-xl text-sm font-medium ${tab==='calendar'?'bg-stone-800 text-white':'bg-white text-stone-500 shadow-sm'}`}>
          📅 カレンダー
        </button>
        <button onClick={() => setTab('requests')}
          className={`flex-1 py-2 rounded-xl text-sm font-medium relative ${tab==='requests'?'bg-stone-800 text-white':'bg-white text-stone-500 shadow-sm'}`}>
          📋 申請
          {pending.length > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
              {pending.length}
            </span>
          )}
        </button>
      </div>

      {tab === 'calendar' && (
        <>
          {/* 月移動 */}
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => setViewMonth(new Date(y, m-1))} className="text-stone-400 px-3 py-1">←</button>
            <span className="font-bold text-teal-600">{y}年{m+1}月</span>
            <button onClick={() => setViewMonth(new Date(y, m+1))} className="text-stone-400 px-3 py-1">→</button>
          </div>

          {/* カレンダー */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {DAYS.map((d,i) => (
              <div key={d} className={`text-center text-xs py-1 ${i===0||i===6?'text-teal-600':'text-stone-400'}`}>{d}</div>
            ))}
            {cells.map((day, i) => {
              if (!day) return <div key={i} />
              const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
              const dayShifts = shifts.filter(s => s.date === dateStr && (s.status === 'approved' || s.status === 'absent'))
              const dow = new Date(y, m, day).getDay()
              const isWeekend = dow === 0 || dow === 6
              const isSelected = selectedDate === dateStr
              return (
                <button key={i} onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                  className={`rounded-xl p-1 text-center min-h-[52px] transition-all ${
                    isSelected ? 'ring-2 ring-teal-500 bg-teal-50' :
                    isWeekend ? 'bg-white border border-stone-200' : 'bg-white/60'
                  }`}>
                  <div className={`text-xs font-medium ${isWeekend?'text-teal-600':'text-stone-600'}`}>{day}</div>
                  <div className="flex flex-wrap gap-0.5 justify-center mt-0.5">
                    {dayShifts.slice(0,4).map((s,j) => {
                      const meta = LOCATION_META[locationOf(s)]
                      const isAbsent = s.status === 'absent'
                      return (
                        <div key={j} className={`w-3.5 h-3.5 rounded-full flex items-center justify-center ${isAbsent?'bg-red-400':s.isOpen?'bg-amber-400 border border-amber-600':meta.dot}`}
                          style={{fontSize:'6px', color:'white', fontWeight:'bold'}}>
                          {s.isOpen ? '?' : s.staffName.slice(-1)}
                        </div>
                      )
                    })}
                    {dayShifts.length > 4 && <div className="w-3.5 h-3.5 rounded-full bg-stone-400 flex items-center justify-center" style={{fontSize:'6px',color:'white'}}>+{dayShifts.length-4}</div>}
                  </div>
                </button>
              )
            })}
          </div>

          {/* 選択日の詳細 */}
          {selectedDate && (
            <div className="bg-white rounded-2xl shadow-sm p-4 space-y-4">
              <h3 className="font-bold text-teal-600">
                {new Date(selectedDate+'T12:00:00').toLocaleDateString('ja-JP',{month:'long',day:'numeric',weekday:'short'})}
              </h3>

              {/* 既存シフト */}
              {shifts.filter(s => s.date === selectedDate && (s.status === 'approved' || s.status === 'absent')).length > 0 && (
                <div className="space-y-1.5">
                  {shifts.filter(s => s.date === selectedDate && (s.status === 'approved' || s.status === 'absent')).map(s => {
                    const loc = locationOf(s)
                    const meta = LOCATION_META[loc]
                    const isAbsent = s.status === 'absent'
                    return (
                      <div key={s.id} className={`flex items-center justify-between rounded-xl px-3 py-2 ${isAbsent?'bg-red-50':s.isOpen?'bg-amber-50 border border-amber-200':loc==='cafe'?'bg-stone-50':meta.cell}`}>
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isAbsent?'bg-red-400':s.isOpen?'bg-amber-400':meta.dot}`} />
                          <span className={`text-sm ${isAbsent?'text-red-500 line-through':s.isOpen?'text-amber-700 font-medium':'text-stone-700'}`}>
                            {s.isOpen ? '🔔 募集中' : s.staffName}
                          </span>
                          {s.note && <span className="text-[10px] text-stone-500 truncate">{s.note}</span>}
                          {loc !== 'cafe' && !isAbsent && !s.isOpen && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${meta.badge}`}>{meta.emoji} {meta.label}</span>
                          )}
                          {isAbsent && <span className="text-xs text-red-400">欠勤</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-stone-400">{s.start_time?.slice(0,5)}〜{s.end_time?.slice(0,5)}</span>
                          <button onClick={() => deleteShift(s.id)}
                            className="w-6 h-6 rounded-full bg-red-100 text-red-500 text-xs font-bold hover:bg-red-500 hover:text-white transition-all">×</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* 追加フォーム */}
              <div className="space-y-3 border-t border-stone-100 pt-3">
                <p className="text-xs text-stone-400 font-medium">＋ シフトを追加</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {staffList.filter(s => s.role !== 'accountant').map(s => (
                    <button key={s.id} onClick={() => setAddStaff(s.id)}
                      className={`py-2 rounded-xl text-xs font-medium transition-all ${
                        addStaff === s.id ? 'bg-stone-800 text-white' :
                        s.role === 'admin' ? 'bg-white border-2 border-teal-300 text-teal-700' :
                        'bg-stone-100 text-stone-700'
                      }`}>
                      {s.name.split(' ')[0] || s.name}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {SHIFT_LOCATION_OPTIONS.map(loc => {
                    const meta = LOCATION_META[loc]
                    const active = addLocation === loc
                    return (
                      <button key={loc} onClick={() => setAddLocation(loc)}
                        className={`py-2 rounded-xl text-xs font-medium transition-all border-2 ${
                          active
                            ? `${meta.cell} ${meta.border} text-stone-800`
                            : 'bg-white border-transparent text-stone-500'
                        }`}>
                        {meta.emoji} {meta.label}
                      </button>
                    )
                  })}
                </div>
                <div className="flex gap-2">
                  <select value={addStart} onChange={e => setAddStart(e.target.value)}
                    className="flex-1 border border-stone-200 rounded-xl px-2 py-2 text-sm bg-white text-stone-800">
                    <option value="">出勤</option>
                    {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <span className="text-stone-400 self-center">〜</span>
                  <select value={addEnd} onChange={e => setAddEnd(e.target.value)}
                    className="flex-1 border border-stone-200 rounded-xl px-2 py-2 text-sm bg-white text-stone-800">
                    <option value="">退勤</option>
                    {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <button onClick={addShift} disabled={loading}
                  className="w-full py-3 bg-stone-800 text-white rounded-xl text-sm font-medium disabled:opacity-50">
                  {loading ? '追加中...' : 'シフトを追加'}
                </button>
              </div>
            </div>
          )}

          {/* キッチンカー一括登録（日ごとに担当・時間を変えられる） */}
          <div className="mt-4 bg-white rounded-2xl shadow-sm p-4">
            <button onClick={() => setShowBulk(v => !v)}
              className="w-full text-left flex items-center justify-between">
              <span className="text-sm font-medium text-stone-700">🚐 {y}年{m+1}月のキッチンカー一括登録</span>
              <span className="text-stone-400">{showBulk ? '−' : '＋'}</span>
            </button>
            {showBulk && (
              <div className="space-y-3 mt-3 border-t border-stone-100 pt-3">
                <p className="text-xs text-stone-400">
                  水・木をデフォルトで一覧に出してます。各日で担当・時間を変えたり、チェックを外して除外したり、＋で他の日（イベント等）を足したりできます。
                </p>

                {bulkRows.length === 0 ? (
                  <p className="text-xs text-stone-400 text-center py-4">この月には水・木がありません。下の「日を追加」で他の日を足せます。</p>
                ) : (
                  <div className="space-y-1.5">
                    {bulkRows.map(r => {
                      const d = new Date(r.date + 'T12:00:00')
                      const dowLabel = DAYS[d.getDay()]
                      return (
                        <div key={r.id} className={'rounded-xl p-2 transition-all ' + (r.include ? 'bg-amber-50 border border-amber-200' : 'bg-stone-100 opacity-50')}>
                          <div className="flex items-center gap-2 mb-1.5">
                            <input type="checkbox" checked={r.include}
                              onChange={e => updateBulkRow(r.id, { include: e.target.checked })}
                              className="w-4 h-4 accent-amber-500" />
                            <span className="text-xs font-medium text-stone-700 flex-1">
                              {d.getMonth()+1}/{d.getDate()}({dowLabel})
                            </span>
                            <button onClick={() => removeBulkRow(r.id)}
                              className="text-xs text-stone-400 hover:text-red-500 px-1">×</button>
                          </div>
                          <div className="flex gap-1 ml-6">
                            <select value={r.staffId} onChange={e => updateBulkRow(r.id, { staffId: e.target.value })}
                              className="flex-1 border border-stone-200 rounded-lg px-2 py-1 text-xs bg-white text-stone-800">
                              <option value="">担当未定</option>
                              {staffList.filter(s => s.role !== 'accountant').map(s => (
                                <option key={s.id} value={s.id}>{s.name.split(' ')[0]}</option>
                              ))}
                            </select>
                            <select value={r.startTime} onChange={e => updateBulkRow(r.id, { startTime: e.target.value })}
                              className="border border-stone-200 rounded-lg px-1 py-1 text-xs bg-white text-stone-800">
                              {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                            <span className="text-stone-400 self-center text-xs">〜</span>
                            <select value={r.endTime} onChange={e => updateBulkRow(r.id, { endTime: e.target.value })}
                              className="border border-stone-200 rounded-lg px-1 py-1 text-xs bg-white text-stone-800">
                              {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* 水・木以外の日を追加（イベント等） */}
                <div className="flex gap-2 items-center pt-2 border-t border-stone-100">
                  <input type="date" value={extraDate}
                    onChange={e => setExtraDate(e.target.value)}
                    className="flex-1 border border-stone-200 rounded-lg px-2 py-1.5 text-xs bg-white text-stone-700" />
                  <button onClick={addExtraBulkRow} disabled={!extraDate}
                    className="px-3 py-1.5 bg-stone-200 text-stone-700 rounded-lg text-xs font-medium disabled:opacity-50">
                    ＋ 日を追加
                  </button>
                </div>

                <button onClick={submitBulkRows} disabled={bulkLoading}
                  className="w-full py-3 bg-amber-500 text-white rounded-xl text-sm font-medium disabled:opacity-50">
                  {bulkLoading
                    ? '追加中...'
                    : `チェック中の${bulkRows.filter(r => r.include && r.staffId).length}件を登録`}
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* 申請タブ */}
      {tab === 'requests' && (() => {
        const recMap: Record<string, AiRec> = {}
        aiResult?.recommendations.forEach(r => { recMap[r.id] = r })
        const recommendedCount = aiResult?.recommendations.filter(r => r.action === 'approve').length ?? 0
        return (
        <div className="space-y-3">
          {/* AIシフト提案 */}
          {pending.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-stone-800 text-sm">🤖 AIシフト提案</p>
                  <p className="text-[11px] text-stone-400 mt-0.5">申請プールを見て承認の助言をします（最終判断は桐島さん）</p>
                </div>
                <button onClick={runAiSuggest} disabled={aiLoading}
                  className="px-3 py-2 bg-stone-800 text-white rounded-xl text-sm font-medium disabled:opacity-50 whitespace-nowrap">
                  {aiLoading ? '考え中…' : 'AIに相談'}
                </button>
              </div>
              {aiResult && (
                <div className="mt-3 space-y-2">
                  {aiResult.summary && (
                    <p className="text-sm text-stone-700 bg-stone-50 rounded-xl px-3 py-2">{aiResult.summary}</p>
                  )}
                  {aiResult.warnings.length > 0 && (
                    <ul className="space-y-1">
                      {aiResult.warnings.map((w, i) => (
                        <li key={i} className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">⚠️ {w}</li>
                      ))}
                    </ul>
                  )}
                  {recommendedCount > 0 && (
                    <button onClick={approveRecommended}
                      className="w-full py-2.5 bg-teal-600 text-white rounded-xl text-sm font-medium">
                      ✓ おすすめの{recommendedCount}件をまとめて承認
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {pending.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center text-stone-400 shadow-sm">
              <p className="text-2xl mb-2">📋</p>
              <p className="text-sm">承認待ちの申請はありません</p>
            </div>
          ) : pending.map(s => {
            const loc = locationOf(s)
            const meta = LOCATION_META[loc]
            const rec = recMap[s.id]
            return (
            <div key={s.id} className={'bg-white rounded-2xl shadow-sm p-4 ' + (rec?.action === 'approve' ? 'ring-2 ring-teal-300' : '')}>
              <div className="flex items-center gap-2">
                <p className="font-medium text-stone-800">{s.staffName}</p>
                {loc !== 'cafe' && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${meta.badge}`}>{meta.emoji} {meta.label}</span>
                )}
                {rec && (
                  <span className={'text-[10px] px-1.5 py-0.5 rounded-full font-medium ' + (
                    rec.action === 'approve' ? 'bg-teal-100 text-teal-700' : 'bg-stone-100 text-stone-500'
                  )}>
                    {rec.action === 'approve' ? '🤖 承認おすすめ' : '🤖 保留'}
                  </span>
                )}
              </div>
              <p className="text-sm text-stone-500 mt-0.5">
                {new Date(s.date+'T12:00:00').toLocaleDateString('ja-JP',{month:'long',day:'numeric',weekday:'short'})}
                　{s.start_time?.slice(0,5)}〜{s.end_time?.slice(0,5)}
              </p>
              {rec?.reason && <p className="text-xs text-stone-400 mt-1">💬 {rec.reason}</p>}
              <div className="flex gap-2 mt-3">
                <button onClick={() => approveRequest(s.id)}
                  className="flex-1 py-2.5 bg-teal-600 text-white rounded-xl text-sm font-medium">✓ 承認</button>
                <button onClick={() => rejectRequest(s.id)}
                  className="flex-1 py-2.5 bg-red-50 text-red-500 rounded-xl text-sm font-medium">✕ 却下</button>
              </div>
            </div>
            )
          })}
        </div>
        )
      })()}
    </main>
  )
}
