'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import dayjs from 'dayjs'
import { CalendarDays, ChevronLeft, ChevronRight, Users, Clock, MapPin, Phone } from 'lucide-react'

interface Reservation {
  id: string
  name: string
  date: string
  time: string
  party_size: number
  contact: string
  notes: string | null
  status: string
  floor_preference: string | null
  end_time: string | null
  source: string | null
}

const statusConfig: Record<string, { label: string; color: string }> = {
  confirmed: { label: '確定', color: 'bg-green-100 text-green-800' },
  pending: { label: '仮予約', color: 'bg-yellow-100 text-yellow-800' },
  cancelled: { label: 'キャンセル', color: 'bg-red-100 text-red-800' },
}

export default function ReservationsPage() {
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date()
    const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
    return jst.toISOString().split('T')[0]
  })

  useEffect(() => {
    setLoading(true)
    fetch(`/api/reservations?date=${selectedDate}`)
      .then(r => r.json())
      .then(data => setReservations(data || []))
      .catch(() => setReservations([]))
      .finally(() => setLoading(false))
  }, [selectedDate])

  function changeDate(offset: number) {
    const d = new Date(selectedDate)
    d.setDate(d.getDate() + offset)
    setSelectedDate(d.toISOString().split('T')[0])
  }

  const totalGuests = reservations
    .filter(r => r.status !== 'cancelled')
    .reduce((sum, r) => sum + r.party_size, 0)

  const activeCount = reservations.filter(r => r.status !== 'cancelled').length

  return (
    <main className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-100 p-4 pb-20">
      <div className="max-w-2xl mx-auto">
        <header className="mb-6">
          <a href="/" className="text-blue-600 hover:underline mb-3 inline-flex items-center gap-1 text-sm">
            <ChevronLeft className="w-4 h-4" /> ホーム
          </a>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-orange-600" />
            予約一覧
          </h1>
        </header>

        {/* Date navigation */}
        <Card className="p-4 mb-4">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => changeDate(-1)}>
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <div className="text-center">
              <p className="text-lg font-bold">
                {dayjs(selectedDate).format('M月D日（ddd）')}
              </p>
              <p className="text-xs text-gray-500">
                {selectedDate === dayjs().format('YYYY-MM-DD') ? '今日' : dayjs(selectedDate).format('YYYY年')}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => changeDate(1)}>
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
        </Card>

        {/* Summary */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <Card className="p-3 text-center">
            <p className="text-sm text-gray-500">予約数</p>
            <p className="text-2xl font-bold text-orange-600">{activeCount}</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="text-sm text-gray-500">合計人数</p>
            <p className="text-2xl font-bold text-orange-600">{totalGuests}</p>
          </Card>
        </div>

        {/* Reservation list */}
        {loading ? (
          <Card className="p-8">
            <div className="flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-gray-300 border-t-orange-500 rounded-full animate-spin" />
              <span className="ml-2 text-gray-500">読み込み中...</span>
            </div>
          </Card>
        ) : reservations.length === 0 ? (
          <Card className="p-8 text-center">
            <CalendarDays className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">この日の予約はありません</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {reservations.map(r => {
              const cfg = statusConfig[r.status] || statusConfig.pending
              return (
                <Card key={r.id} className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-bold text-lg">{r.name}</p>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
                        {cfg.label}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-orange-600 flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {r.time}
                      </p>
                      {r.end_time && (
                        <p className="text-xs text-gray-500">〜 {r.end_time}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3 text-sm text-gray-600">
                    <span className="flex items-center gap-1">
                      <Users className="w-4 h-4" />
                      {r.party_size}名
                    </span>
                    {r.floor_preference && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-4 h-4" />
                        {r.floor_preference === '1F' ? '1階' : r.floor_preference === '2F' ? '2階' : r.floor_preference}
                      </span>
                    )}
                    {r.contact && (
                      <span className="flex items-center gap-1">
                        <Phone className="w-4 h-4" />
                        {r.contact}
                      </span>
                    )}
                  </div>
                  {r.notes && (
                    <p className="mt-2 text-sm text-gray-500 bg-gray-50 p-2 rounded">
                      {r.notes}
                    </p>
                  )}
                  {r.source && (
                    <p className="mt-1 text-xs text-gray-400">
                      経由: {r.source}
                    </p>
                  )}
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
