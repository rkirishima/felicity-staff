'use client'
import { useState } from 'react'
import { PERSIAN_DINNER as EV, cancelDeadline } from '@/lib/events/persian-dinner'

const DAYS_JA = ['日', '月', '火', '水', '木', '金', '土']
const yen = (n: number) => `¥${n.toLocaleString('ja-JP')}`

export default function PersianDinnerPage() {
  const [qty, setQty] = useState(1)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const d = new Date(EV.date + 'T00:00:00')
  const dateLabel = `${d.getMonth() + 1}/${d.getDate()}(${DAYS_JA[d.getDay()]})`
  const total = EV.price_jpy * qty
  const cd = new Date(cancelDeadline() + 'T00:00:00')
  const cancelLabel = `${cd.getMonth() + 1}/${cd.getDate()}(${DAYS_JA[cd.getDay()]})`
  const [agree, setAgree] = useState(false)

  async function pay() {
    setErr('')
    if (!name.trim()) { setErr('お名前を入力してください / Please enter your name'); return }
    if (!agree) { setErr('キャンセルポリシーに同意してください / Please accept the cancellation policy'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/events/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qty, name, email }),
      })
      const j = await r.json()
      if (!r.ok || !j.url) throw new Error(j.error ?? 'error')
      window.location.href = j.url
    } catch (e) {
      setErr(e instanceof Error ? e.message : '決済の開始に失敗しました')
      setBusy(false)
    }
  }

  const input = 'w-full px-3 py-2.5 rounded-xl text-sm border outline-none'
  const inputStyle = { backgroundColor: '#F5F0E8', borderColor: '#E8E0D4', color: '#292524' }

  return (
    <div className="min-h-screen -mb-20 pb-10" style={{ backgroundColor: '#FAF7F2', color: '#292524' }}>
      <div className="text-center text-[11px] py-1.5 font-medium" style={{ backgroundColor: '#fde68a', color: '#78350f' }}>
        TEST MODE — 実際の請求は発生しません / No real charge
      </div>

      <div className="max-w-md mx-auto px-4">
        <div className="mt-6 rounded-3xl overflow-hidden relative" style={{ backgroundColor: '#7c2d12' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={EV.photo} alt={EV.title_en} className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(28,25,23,0.85), rgba(28,25,23,0.15) 70%)' }} />
          <div className="relative px-6 pt-40 pb-6 text-white">
            <p className="text-xs tracking-[0.2em] opacity-80">FELICITY POP-UP</p>
            <h1 className="text-2xl font-semibold mt-2 leading-snug">{EV.title}</h1>
            <p className="text-sm opacity-90 mt-1">{EV.title_en}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-4 text-center">
          {[
            ['日時 / Date', `${dateLabel} ${EV.start_time}〜`],
            ['定員 / Seats', `${EV.capacity}名`],
            ['料金 / Price', `${yen(EV.price_jpy)}`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-2xl border bg-white px-2 py-3" style={{ borderColor: '#E8E0D4' }}>
              <p className="text-[10px] text-stone-500">{k}</p>
              <p className="text-sm font-semibold mt-1">{v}</p>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-stone-500 text-right mt-1">料金は1名あたり・税込・ドリンク別 / per person, tax incl., drinks not included</p>

        <div className="mt-4 rounded-2xl border bg-white p-4 text-sm leading-relaxed" style={{ borderColor: '#E8E0D4' }}>
          <p>{EV.description}</p>
          <p className="text-stone-500 mt-2 text-xs">{EV.description_en}</p>
          <div className="mt-3 pt-3 border-t" style={{ borderColor: '#E8E0D4' }}>
            <p className="text-xs font-semibold">🍷 ドリンク（別料金・当日会計）/ Drinks (separate, pay on the day)</p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {EV.drinks.map((d, i) => (
                <span key={d} className="text-[11px] px-2.5 py-1 rounded-full" style={{ backgroundColor: '#F5F0E8' }}>
                  {d} / {EV.drinks_en[i]}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border bg-white p-4 space-y-3" style={{ borderColor: '#E8E0D4' }}>
          <h2 className="text-sm font-semibold">ご予約 / Reserve</h2>
          <input className={input} style={inputStyle} placeholder="お名前 / Name" value={name} onChange={e => setName(e.target.value)} />
          <input className={input} style={inputStyle} placeholder="メール / Email（任意）" type="email" value={email} onChange={e => setEmail(e.target.value)} />

          <div className="flex items-center justify-between">
            <span className="text-sm">人数 / Guests</span>
            <div className="flex items-center gap-3">
              <button className="w-9 h-9 rounded-full border text-lg disabled:opacity-30" style={{ borderColor: '#E8E0D4' }}
                disabled={qty <= 1} onClick={() => setQty(q => q - 1)}>−</button>
              <span className="w-6 text-center font-semibold">{qty}</span>
              <button className="w-9 h-9 rounded-full border text-lg disabled:opacity-30" style={{ borderColor: '#E8E0D4' }}
                disabled={qty >= EV.max_per_order} onClick={() => setQty(q => q + 1)}>＋</button>
            </div>
          </div>

          <div className="flex items-center justify-between border-t pt-3" style={{ borderColor: '#E8E0D4' }}>
            <span className="text-sm text-stone-500">{yen(EV.price_jpy)} × {qty}</span>
            <span className="text-xl font-semibold">{yen(total)}</span>
          </div>

          <div className="rounded-xl p-3 text-xs leading-relaxed" style={{ backgroundColor: '#F5F0E8' }}>
            <p className="font-semibold mb-1">キャンセルポリシー / Cancellation</p>
            <p>開催3日前（{cancelLabel} 23:59）までのキャンセルは全額返金。それ以降のキャンセル・無断欠席は返金不可です。</p>
            <p className="text-stone-500 mt-1">Full refund if cancelled by {cancelLabel} 23:59 (3 days before). No refund after that or for no-shows.</p>
            <label className="flex items-center gap-2 mt-2">
              <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} />
              <span>同意する / I agree</span>
            </label>
          </div>

          {err && <p className="text-xs text-red-600">{err}</p>}

          <button onClick={pay} disabled={busy}
            className="w-full py-3 rounded-xl text-white font-medium disabled:opacity-60"
            style={{ backgroundColor: '#14b8a6' }}>
            {busy ? '処理中…' : `${yen(total)} を支払って予約 / Pay & Reserve`}
          </button>
          <p className="text-[10px] text-stone-400 text-center">決済は Stripe で安全に処理されます / Secure payment by Stripe</p>
        </div>
      </div>
    </div>
  )
}
