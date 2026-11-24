'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

type Booking = {
  id: string; name: string; email: string | null; qty: number; amount_jpy: number
  status: 'pending' | 'paid' | 'expired' | 'cancelled' | 'refunded'
  paid_at: string | null; created_at: string; cancelled_at: string | null
}
type Data = { event: { title: string; date: string; start_time: string; capacity: number }; bookings: Booking[] }

const yen = (n: number) => `¥${n.toLocaleString('ja-JP')}`
const jst = (iso: string | null) => iso ? new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString().slice(5, 16).replace('T', ' ') : ''
const STATUS: Record<Booking['status'], [string, string]> = {
  paid: ['確定', '#16a34a'], pending: ['決済中', '#d97706'], expired: ['未決済', '#a8a29e'],
  cancelled: ['キャンセル', '#ef4444'], refunded: ['返金済', '#ef4444'],
}

export default function PersianDinnerBookingsPage() {
  const [data, setData] = useState<Data | null>(null)
  const [showAll, setShowAll] = useState(false)

  function load() {
    return fetch('/api/events/bookings', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((j: Data) => setData(j))
      .catch(() => toast.error('読み込み失敗'))
  }
  useEffect(() => {
    fetch('/api/events/bookings', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((j: Data) => setData(j))
      .catch(() => toast.error('読み込み失敗'))
  }, [])

  async function refund(b: Booking) {
    if (!confirm(`${b.name}様（${b.qty}名 ${yen(b.amount_jpy)}）を全額返金してキャンセルします。よろしいですか？`)) return
    const r = await fetch(`/api/events/bookings/${b.id}/refund`, { method: 'POST' })
    const j = await r.json()
    if (!r.ok) { toast.error(j.error ?? '返金失敗'); return }
    toast.success('返金しました'); load()
  }

  function downloadCsv() {
    if (!data) return
    const rows = data.bookings.filter(b => b.status === 'paid')
    const csv = ['名前,人数,金額,メール,決済日時', ...rows.map(b =>
      [b.name, b.qty, b.amount_jpy, b.email ?? '', jst(b.paid_at)].map(v => `"${String(v).replaceAll('"', '""')}"`).join(','))].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }))
    a.download = `persian-dinner-bookings.csv`
    a.click()
  }

  const paid = data?.bookings.filter(b => b.status === 'paid') ?? []
  const qty = paid.reduce((s, b) => s + b.qty, 0)
  const amount = paid.reduce((s, b) => s + b.amount_jpy, 0)
  const list = showAll ? data?.bookings ?? [] : paid

  return (
    <main className="min-h-screen p-4 pb-24" style={{ backgroundColor: '#F5F0E8', color: '#292524' }}>
      <div className="max-w-lg mx-auto">
        <a href="/admin/events" className="text-xs text-stone-500">← イベント管理</a>
        <h1 className="text-lg font-medium mt-2">『{data?.event.title ?? '…'}』予約リスト</h1>
        {data && <p className="text-xs text-stone-500">{data.event.date.replaceAll('-', '/')} {data.event.start_time}〜</p>}

        <div className="grid grid-cols-3 gap-2 mt-4 text-center">
          {[['予約', `${qty} / ${data?.event.capacity ?? 20}名`], ['残席', `${Math.max(0, (data?.event.capacity ?? 20) - qty)}名`], ['売上', yen(amount)]].map(([k, v]) => (
            <div key={k} className="rounded-2xl bg-white border p-3" style={{ borderColor: '#E8E0D4' }}>
              <p className="text-[10px] text-stone-500">{k}</p><p className="text-sm font-semibold mt-1">{v}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between mt-4">
          <label className="text-xs flex items-center gap-1">
            <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} /> 未決済・キャンセルも表示
          </label>
          <div className="flex gap-2">
            <button onClick={load} className="text-xs px-3 py-1.5 rounded-xl bg-white border" style={{ borderColor: '#E8E0D4' }}>更新</button>
            <button onClick={downloadCsv} className="text-xs px-3 py-1.5 rounded-xl text-white" style={{ backgroundColor: '#14b8a6' }}>CSV</button>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {list.length === 0 && <p className="text-sm text-stone-500 text-center py-8">まだ予約はありません</p>}
          {list.map(b => (
            <div key={b.id} className="rounded-2xl bg-white border p-3 flex items-center justify-between" style={{ borderColor: '#E8E0D4' }}>
              <div>
                <p className="text-sm font-medium">{b.name} <span className="text-stone-500">{b.qty}名</span></p>
                <p className="text-[11px] text-stone-500">{b.email ?? 'メールなし'} ・ {jst(b.paid_at ?? b.created_at)}</p>
              </div>
              <div className="text-right">
                <p className="text-sm">{yen(b.amount_jpy)}</p>
                <span className="text-[10px] font-medium" style={{ color: STATUS[b.status][1] }}>{STATUS[b.status][0]}</span>
                {b.status === 'paid' && (
                  <button onClick={() => refund(b)} className="block ml-auto mt-1 text-[10px] text-red-500 underline">返金してキャンセル</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
