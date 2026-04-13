'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { getAdminSession } from '@/lib/session'
import { ChevronLeft, ChevronRight, Plus, X, Phone, Globe, Footprints, MessageSquare, Check, Ban } from 'lucide-react'

const HOURS = ['09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30','13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30','18:00','18:30']

const BUSINESS_HOURS: Record<number, { open: string; close: string } | null> = {
  0: { open: '09:00', close: '17:00' }, // Sun
  1: { open: '11:00', close: '17:00' }, // Mon
  2: { open: '11:00', close: '17:00' }, // Tue
  3: null, // Wed closed
  4: null, // Thu closed
  5: { open: '11:00', close: '17:00' }, // Fri
  6: { open: '09:00', close: '17:00' }, // Sat
}

const DAYS_JA = ['日','月','火','水','木','金','土']

const SOURCE_ICONS: Record<string, any> = {
  phone: Phone,
  chatbot: Globe,
  walkin: Footprints,
  staff: MessageSquare,
  doug: MessageSquare,
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + mins
  return `${String(Math.floor(total / 60)).padStart(2,'0')}:${String(total % 60).padStart(2,'0')}`
}

interface Reservation {
  id: string
  name: string
  date: string
  time: string
  end_time: string | null
  party_size: number
  contact: string
  floor_preference: string | null
  notes: string | null
  status: string
  source: string | null
  created_by: string | null
}

interface EventInstance {
  id: string
  date: string
  start_time: string | null
  end_time: string | null
  status: string
  notes: string | null
  event: {
    id: string
    title: string
    floor_block: string | null
    seats_blocked: number
    time_relation: string
  }
}

interface FloorCap {
  floor: string
  total_seats: number
}

export default function AdminReservationsPage() {
  const [date, setDate] = useState(formatDate(new Date()))
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [events, setEvents] = useState<EventInstance[]>([])
  const [floors, setFloors] = useState<FloorCap[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const router = useRouter()

  // New reservation form
  const [form, setForm] = useState({
    name: '', time: '12:00', party_size: 2, floor_preference: '',
    contact: '', notes: '', source: 'phone',
  })

  useEffect(() => {
    if (!getAdminSession()) { router.replace('/admin'); return }
    loadFloors()
  }, [])

  useEffect(() => { loadDay() }, [date])

  async function loadFloors() {
    const { data } = await supabase.from('floor_capacity').select('floor, total_seats')
    setFloors(data ?? [])
  }

  const loadDay = useCallback(async () => {
    setLoading(true)

    // Load reservations
    const { data: resData } = await supabase
      .from('reservations')
      .select('*')
      .eq('date', date)
      .in('status', ['pending', 'confirmed', 'completed'])
      .order('time')

    setReservations(resData ?? [])

    // Load event instances with parent event info
    const { data: evData } = await supabase
      .from('event_instances')
      .select('*, event:events(id, title, floor_block, seats_blocked, time_relation)')
      .eq('date', date)
      .eq('status', 'scheduled')

    setEvents((evData ?? []).map((e: any) => ({ ...e, event: e.event })))
    setLoading(false)
  }, [date, supabase])

  // Calculate used seats per floor for a given time
  function getUsedSeats(floor: string, time: string): number {
    const endTime = addMinutes(time, 90)
    let used = 0

    // Count reservations overlapping this time
    reservations.forEach(r => {
      if (r.status === 'cancelled') return
      const rFloor = r.floor_preference || '1F'
      if (rFloor !== floor) return
      const rEnd = r.end_time || addMinutes(r.time, 90)
      if (r.time < endTime && rEnd > time) {
        used += r.party_size
      }
    })

    return used
  }

  function getEventBlocked(floor: string, time: string): number {
    const endTime = addMinutes(time, 90)
    let blocked = 0

    events.forEach(e => {
      if (!e.event || e.event.time_relation !== 'during') return
      if (!e.event.floor_block || (e.event.floor_block !== floor && e.event.floor_block !== 'both')) return
      const eStart = e.start_time || '00:00'
      const eEnd = e.end_time || '23:59'
      if (eStart < endTime && eEnd > time) {
        const cap = floors.find(f => f.floor === floor)?.total_seats || 0
        blocked += e.event.seats_blocked === 0 ? cap : e.event.seats_blocked
      }
    })

    return blocked
  }

  function getAvailable(floor: string, time: string): number {
    const cap = floors.find(f => f.floor === floor)?.total_seats || 0
    return Math.max(0, cap - getUsedSeats(floor, time) - getEventBlocked(floor, time))
  }

  // Date navigation
  const dateObj = new Date(date + 'T00:00:00')
  const dayOfWeek = dateObj.getDay()
  const biz = BUSINESS_HOURS[dayOfWeek]

  function prevDay() { const d = new Date(dateObj); d.setDate(d.getDate() - 1); setDate(formatDate(d)) }
  function nextDay() { const d = new Date(dateObj); d.setDate(d.getDate() + 1); setDate(formatDate(d)) }
  function today() { setDate(formatDate(new Date())) }

  async function createReservation() {
    if (!form.name || !form.time || !form.contact) {
      toast.error('名前・時間・連絡先を入力してください'); return
    }
    const session = getAdminSession()
    const { error } = await supabase.from('reservations').insert({
      name: form.name,
      date,
      time: form.time,
      party_size: form.party_size,
      contact: form.contact,
      floor_preference: form.floor_preference || null,
      notes: form.notes || null,
      status: 'confirmed',
      source: form.source,
      created_by: session?.staffName || 'admin',
    })
    if (error) { toast.error('予約作成失敗: ' + error.message); return }
    toast.success('予約を作成しました')
    setShowNew(false)
    setForm({ name: '', time: '12:00', party_size: 2, floor_preference: '', contact: '', notes: '', source: 'phone' })
    loadDay()
  }

  async function updateStatus(id: string, status: string) {
    const { error } = await supabase.from('reservations').update({ status }).eq('id', id)
    if (error) { toast.error('更新失敗'); return }
    toast.success(status === 'confirmed' ? '確認しました' : status === 'cancelled' ? 'キャンセルしました' : '更新しました')
    loadDay()
  }

  // Merge reservations and events into timeline
  const timeline: { type: 'reservation' | 'event'; time: string; data: any }[] = [
    ...reservations.map(r => ({ type: 'reservation' as const, time: r.time, data: r })),
    ...events.filter(e => e.start_time).map(e => ({ type: 'event' as const, time: e.start_time!, data: e })),
  ].sort((a, b) => a.time.localeCompare(b.time))

  return (
    <main className="min-h-screen pb-24" style={{ backgroundColor: '#F5F0E8' }}>
      {/* Header */}
      <div className="sticky top-0 z-40 px-4 pt-4 pb-3" style={{ backgroundColor: '#F5F0E8' }}>
        <div className="flex items-center justify-between mb-3">
          <button onClick={prevDay} className="p-2 rounded-xl" style={{ backgroundColor: '#E8E0D4' }}>
            <ChevronLeft size={20} color="#57534e" />
          </button>
          <div className="text-center">
            <button onClick={today} className="text-lg font-medium" style={{ color: '#292524' }}>
              {dateObj.getMonth() + 1}/{dateObj.getDate()}({DAYS_JA[dayOfWeek]})
            </button>
            <div className="text-xs mt-0.5" style={{ color: '#78716c' }}>
              {biz ? `${biz.open}〜${biz.close}` : '定休日'}
            </div>
          </div>
          <button onClick={nextDay} className="p-2 rounded-xl" style={{ backgroundColor: '#E8E0D4' }}>
            <ChevronRight size={20} color="#57534e" />
          </button>
        </div>

        {/* Floor capacity bars */}
        <div className="flex gap-2">
          {floors.map(f => {
            const now = new Date()
            const currentTime = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`
            const avail = getAvailable(f.floor, currentTime)
            const pct = Math.round((1 - avail / f.total_seats) * 100)
            return (
              <div key={f.floor} className="flex-1 rounded-xl p-2" style={{ backgroundColor: '#E8E0D4' }}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-medium" style={{ color: '#57534e' }}>{f.floor}</span>
                  <span className="text-xs" style={{ color: '#78716c' }}>{avail}/{f.total_seats}</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: '#D6CFC4' }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: pct > 80 ? '#ef4444' : pct > 50 ? '#f59e0b' : '#14b8a6',
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Timeline */}
      <div className="px-4 space-y-2">
        {loading ? (
          <div className="text-center py-12" style={{ color: '#A8A29E' }}>読み込み中...</div>
        ) : timeline.length === 0 ? (
          <div className="text-center py-12" style={{ color: '#A8A29E' }}>
            {biz ? '予約はありません' : '定休日です'}
          </div>
        ) : (
          timeline.map((item) => {
            if (item.type === 'event') {
              const e = item.data as EventInstance
              return (
                <div key={`ev-${e.id}`} className="rounded-2xl p-4 border"
                  style={{ backgroundColor: '#EBE5F5', borderColor: '#D4CCE5' }}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono" style={{ color: '#7C3AED' }}>
                      {e.start_time?.slice(0,5)}–{e.end_time?.slice(0,5)}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: '#D4CCE5', color: '#5B21B6' }}>
                      イベント
                    </span>
                  </div>
                  <div className="text-sm font-medium mt-1" style={{ color: '#292524' }}>{e.event?.title}</div>
                  {e.event?.floor_block && (
                    <div className="text-xs mt-1" style={{ color: '#78716c' }}>
                      {e.event.floor_block === 'both' ? '1F+2F' : e.event.floor_block}
                      {e.event.seats_blocked > 0 ? ` ${e.event.seats_blocked}席確保` : ' 全席確保'}
                    </div>
                  )}
                </div>
              )
            }

            const r = item.data as Reservation
            const isExpanded = expandedId === r.id
            const SourceIcon = SOURCE_ICONS[r.source || 'chatbot'] || Globe
            return (
              <div key={r.id}
                className="rounded-2xl overflow-hidden border transition-all"
                style={{ backgroundColor: '#FFFFFF', borderColor: '#E8E0D4' }}
                onClick={() => setExpandedId(isExpanded ? null : r.id)}
              >
                <div className="flex items-center gap-3 p-4">
                  {/* Time */}
                  <div className="text-center w-12 flex-shrink-0">
                    <div className="text-sm font-mono font-medium" style={{ color: '#292524' }}>
                      {r.time.slice(0,5)}
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate" style={{ color: '#292524' }}>{r.name}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: '#E8E0D4', color: '#57534e' }}>
                        {r.party_size}名
                      </span>
                      {r.floor_preference && (
                        <span className="text-xs px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: '#DBEAFE', color: '#1D4ED8' }}>
                          {r.floor_preference}
                        </span>
                      )}
                    </div>
                    {r.notes && (
                      <div className="text-xs truncate mt-0.5" style={{ color: '#A8A29E' }}>{r.notes}</div>
                    )}
                  </div>

                  {/* Status + Source */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <SourceIcon size={14} color="#A8A29E" />
                    <div className="w-2 h-2 rounded-full" style={{
                      backgroundColor: r.status === 'confirmed' ? '#14b8a6' : r.status === 'pending' ? '#f59e0b' : '#78716c',
                    }} />
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t" style={{ borderColor: '#E8E0D4' }}>
                    <div className="pt-3 space-y-2 text-xs" style={{ color: '#78716c' }}>
                      <div>連絡先: {r.contact}</div>
                      {r.notes && <div>メモ: {r.notes}</div>}
                      <div>ソース: {r.source || 'chatbot'} {r.created_by ? `(${r.created_by})` : ''}</div>
                      <div>ステータス: {r.status}</div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      {r.status === 'pending' && (
                        <button onClick={(e) => { e.stopPropagation(); updateStatus(r.id, 'confirmed') }}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium"
                          style={{ backgroundColor: '#14b8a6', color: 'white' }}>
                          <Check size={14} /> 確認
                        </button>
                      )}
                      {(r.status === 'pending' || r.status === 'confirmed') && (
                        <button onClick={(e) => { e.stopPropagation(); updateStatus(r.id, 'cancelled') }}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium"
                          style={{ backgroundColor: '#fecaca', color: '#dc2626' }}>
                          <Ban size={14} /> キャンセル
                        </button>
                      )}
                      {r.status === 'confirmed' && (
                        <button onClick={(e) => { e.stopPropagation(); updateStatus(r.id, 'completed') }}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium"
                          style={{ backgroundColor: '#E8E0D4', color: '#57534e' }}>
                          完了
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* FAB - New reservation */}
      <button
        onClick={() => setShowNew(true)}
        className="fixed bottom-20 right-4 w-14 h-14 rounded-full flex items-center justify-center shadow-lg z-40"
        style={{ backgroundColor: '#14b8a6' }}
      >
        <Plus size={24} color="white" />
      </button>

      {/* New reservation bottom sheet */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setShowNew(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative w-full rounded-t-3xl p-6 pb-8 max-h-[85vh] overflow-y-auto"
            style={{ backgroundColor: '#F5F0E8' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium" style={{ color: '#292524' }}>新しい予約</h3>
              <button onClick={() => setShowNew(false)} className="p-1"><X size={20} color="#78716c" /></button>
            </div>

            <div className="space-y-3">
              <input value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                placeholder="名前" className="w-full px-4 py-3 rounded-xl text-sm border"
                style={{ backgroundColor: '#fff', borderColor: '#E8E0D4', color: '#292524' }} />

              <div className="flex gap-2">
                <select value={form.time} onChange={e => setForm({...form, time: e.target.value})}
                  className="flex-1 px-4 py-3 rounded-xl text-sm border"
                  style={{ backgroundColor: '#fff', borderColor: '#E8E0D4', color: '#292524' }}>
                  {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
                <div className="flex items-center gap-1 px-3 rounded-xl border" style={{ backgroundColor: '#fff', borderColor: '#E8E0D4' }}>
                  <button onClick={() => setForm({...form, party_size: Math.max(1, form.party_size - 1)})}
                    className="w-8 h-8 rounded-lg text-lg" style={{ color: '#57534e' }}>−</button>
                  <span className="w-8 text-center text-sm font-medium" style={{ color: '#292524' }}>{form.party_size}</span>
                  <button onClick={() => setForm({...form, party_size: form.party_size + 1})}
                    className="w-8 h-8 rounded-lg text-lg" style={{ color: '#57534e' }}>+</button>
                </div>
              </div>

              {/* Floor preference */}
              <div className="flex gap-2">
                {['', '1F', '2F'].map(f => (
                  <button key={f} onClick={() => setForm({...form, floor_preference: f})}
                    className="flex-1 py-2.5 rounded-xl text-xs font-medium border transition-all"
                    style={{
                      backgroundColor: form.floor_preference === f ? '#14b8a6' : '#fff',
                      color: form.floor_preference === f ? 'white' : '#57534e',
                      borderColor: form.floor_preference === f ? '#14b8a6' : '#E8E0D4',
                    }}>
                    {f || '指定なし'}
                  </button>
                ))}
              </div>

              {/* Availability indicator */}
              <div className="flex gap-2 text-xs" style={{ color: '#78716c' }}>
                <span>空席: 1F {getAvailable('1F', form.time)}席</span>
                <span>/ 2F {getAvailable('2F', form.time)}席</span>
              </div>

              <input value={form.contact} onChange={e => setForm({...form, contact: e.target.value})}
                placeholder="連絡先（電話/メール）" className="w-full px-4 py-3 rounded-xl text-sm border"
                style={{ backgroundColor: '#fff', borderColor: '#E8E0D4', color: '#292524' }} />

              {/* Source */}
              <div className="flex gap-2">
                {[
                  { value: 'phone', label: '電話' },
                  { value: 'walkin', label: 'ウォークイン' },
                  { value: 'staff', label: 'その他' },
                ].map(s => (
                  <button key={s.value} onClick={() => setForm({...form, source: s.value})}
                    className="flex-1 py-2 rounded-xl text-xs font-medium border transition-all"
                    style={{
                      backgroundColor: form.source === s.value ? '#292524' : '#fff',
                      color: form.source === s.value ? 'white' : '#57534e',
                      borderColor: form.source === s.value ? '#292524' : '#E8E0D4',
                    }}>
                    {s.label}
                  </button>
                ))}
              </div>

              <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})}
                placeholder="メモ（オプション）" rows={2}
                className="w-full px-4 py-3 rounded-xl text-sm border resize-none"
                style={{ backgroundColor: '#fff', borderColor: '#E8E0D4', color: '#292524' }} />

              <button onClick={createReservation}
                className="w-full py-3.5 rounded-xl text-sm font-medium"
                style={{ backgroundColor: '#14b8a6', color: 'white' }}>
                予約を作成
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
