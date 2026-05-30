'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getAdminSession } from '@/lib/session'
import { effectiveRevenueCategory, type RevenueCategory } from '@/lib/keiri/classifyRevenue'

function thisMonthJST(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 7)
}

function monthOptions(count = 36): { value: string; label: string }[] {
  const list: { value: string; label: string }[] = []
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000)
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    const value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    const label = `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月`
    list.push({ value, label })
  }
  return list
}

type Preview = {
  buckets: { dine_in_10: number; goods_10: number; beans_8: number; takeout_8: number; unknown: number }
  stripeByRate: { '10': number; '8': number; unknown: number }
  invTotal: number
  expTotal: number
  bankCredit: number
  bankDebit: number
  sqTotal: number
  orderTotal: number
  inventoryTotal: number
  monthEnd: string
}

export default function TaxReportPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const months = useMemo(() => monthOptions(36), [])
  const [month, setMonth] = useState(thisMonthJST())
  const [preview, setPreview] = useState<Preview | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!getAdminSession()) router.replace('/admin')
  }, [router])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const start = `${month}-01`
      const [y, m] = month.split('-').map(s => parseInt(s, 10))
      const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
      const end = `${nextMonth}-01`
      const beginIso = new Date(`${month}-01T00:00:00+09:00`).toISOString()
      const endIso = new Date(`${nextMonth}-01T00:00:00+09:00`).toISOString()

      // month-end date
      const monthEndDate = new Date(`${nextMonth}-01T00:00:00+09:00`)
      monthEndDate.setUTCDate(monthEndDate.getUTCDate() - 1)
      const monthEndStr = monthEndDate.toISOString().slice(0, 10)

      const [sqRes, stripeRes, invRes, expRes, bankRes, ordRes, ovRes, inventoryRes] = await Promise.all([
        supabase.from('keiri_square_line_items')
          .select('tax_rate, category, item_name, gross_amount')
          .gte('date', start).lt('date', end),
        supabase.from('keiri_stripe_line_items')
          .select('tax_rate, amount')
          .gte('date', start).lt('date', end),
        supabase.from('keiri_invoices')
          .select('total')
          .eq('status', 'paid')
          .gte('paid_at', beginIso).lt('paid_at', endIso),
        supabase.from('keiri_transactions')
          .select('amount')
          .eq('type', 'expense')
          .gte('date', start).lt('date', end),
        supabase.from('keiri_bank_transactions')
          .select('debit, credit')
          .gte('date', start).lt('date', end),
        supabase.from('orders')
          .select('amount, status')
          .in('status', ['paid', 'shipped', 'completed'])
          .gte('created_at', beginIso).lt('created_at', endIso),
        supabase.from('keiri_square_item_overrides').select('item_name, revenue_category'),
        supabase.from('keiri_inventory_snapshots').select('unit_price, quantity').eq('snapshot_date', monthEndStr),
      ])
      if (cancelled) return

      const overrides = new Map<string, RevenueCategory>()
      for (const o of (ovRes?.data ?? []) as { item_name: string; revenue_category: string }[]) {
        overrides.set(o.item_name, o.revenue_category as RevenueCategory)
      }

      const buckets = { dine_in_10: 0, goods_10: 0, beans_8: 0, takeout_8: 0, unknown: 0 }
      for (const li of (sqRes.data ?? []) as { tax_rate: number | null; category: string | null; item_name: string | null; gross_amount: number }[]) {
        const rc = effectiveRevenueCategory(
          { tax_rate: li.tax_rate, item_name: li.item_name, category: li.category },
          overrides,
        )
        buckets[rc] += li.gross_amount || 0
      }
      const stripeByRate = { '10': 0, '8': 0, unknown: 0 } as Preview['stripeByRate']
      for (const li of (stripeRes.data ?? []) as { tax_rate: number | null; amount: number }[]) {
        const k = li.tax_rate === 10 ? '10' : li.tax_rate === 8 ? '8' : 'unknown'
        stripeByRate[k] += li.amount || 0
      }
      const inventoryTotal = ((inventoryRes?.data ?? []) as { unit_price: number; quantity: number }[])
        .reduce((s, r) => s + Math.round((r.unit_price || 0) * (r.quantity || 0)), 0)

      setPreview({
        buckets,
        stripeByRate,
        invTotal: (invRes.data ?? []).reduce((s: number, r: { total: number }) => s + (r.total || 0), 0),
        expTotal: (expRes.data ?? []).reduce((s: number, r: { amount: number }) => s + (r.amount || 0), 0),
        bankCredit: (bankRes.data ?? []).reduce((s: number, r: { credit: number | null }) => s + (r.credit || 0), 0),
        bankDebit: (bankRes.data ?? []).reduce((s: number, r: { debit: number | null }) => s + (r.debit || 0), 0),
        orderTotal: (ordRes.data ?? []).reduce((s: number, r: { amount: number }) => s + (r.amount || 0), 0),
        sqTotal: buckets.dine_in_10 + buckets.goods_10 + buckets.beans_8 + buckets.takeout_8 + buckets.unknown,
        inventoryTotal,
        monthEnd: monthEndStr,
      })
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [month, supabase])

  function downloadCsv() {
    window.location.href = `/api/keiri/tax-report/csv?month=${month}`
  }

  function downloadPdf() {
    window.location.href = `/api/keiri/tax-report/pdf?month=${month}`
  }

  const salesTotal = preview ? preview.sqTotal + preview.orderTotal + preview.invTotal : 0
  const profit = preview ? salesTotal - preview.expTotal : 0

  return (
    <main className="min-h-screen pb-24 px-4 pt-8" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="max-w-lg mx-auto space-y-3">
        <div className="flex items-center justify-between">
          <button onClick={() => router.push('/admin/keiri')} className="text-stone-500 text-sm">← 戻る</button>
          <h1 className="text-lg font-semibold tracking-wider text-stone-800">税理士レポート</h1>
          <div className="w-12" />
        </div>

        <select
          value={month}
          onChange={e => setMonth(e.target.value)}
          className="w-full bg-white rounded-xl px-3 py-2 text-sm border border-stone-200"
        >
          {months.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={downloadCsv}
            className="bg-stone-800 text-white py-3 rounded-2xl font-medium"
          >
            📄 CSV ダウンロード
          </button>
          <button
            onClick={downloadPdf}
            className="bg-rose-700 text-white py-3 rounded-2xl font-medium"
          >
            🗎 PDF ダウンロード
          </button>
        </div>

        {loading ? (
          <p className="text-center text-stone-400 text-sm py-12">読み込み中…</p>
        ) : preview ? (
          <>
            <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
              <p className="text-xs text-stone-500 tracking-wider">月次サマリー（プレビュー）</p>

              <div className="space-y-1.5 text-sm">
                <p className="text-xs text-stone-500 mt-1">店舗 Square</p>
                <SummaryRow label="🍽 10% イートイン" value={preview.buckets.dine_in_10} />
                <SummaryRow label="👕 10% 物販（グッズ）" value={preview.buckets.goods_10} />
                <SummaryRow label="☕ 8% 豆等の物販" value={preview.buckets.beans_8} />
                <SummaryRow label="🥡 8% テイクアウト" value={preview.buckets.takeout_8} />
                {preview.buckets.unknown > 0 && (
                  <SummaryRow label="❓ 未分類" value={preview.buckets.unknown} amber />
                )}
                <SummaryRow label="Square 合計" value={preview.sqTotal} bold border />

                <p className="text-xs text-stone-500 pt-3">EC Stripe</p>
                <SummaryRow label="💳 10%" value={preview.stripeByRate['10']} />
                <SummaryRow label="💳 8%" value={preview.stripeByRate['8']} />
                {preview.stripeByRate.unknown > 0 && (
                  <SummaryRow label="❓ 未分類" value={preview.stripeByRate.unknown} amber />
                )}
                <SummaryRow label="Stripe 合計（注文ベース）" value={preview.orderTotal} bold border />

                <p className="text-xs text-stone-500 pt-3">業販請求書</p>
                <SummaryRow label="📨 入金確認済 合計" value={preview.invTotal} bold border />

                <p className="text-xs text-stone-500 pt-3">経費</p>
                <SummaryRow label="📒 経費合計" value={preview.expTotal} bold border />

                <p className="text-xs text-stone-500 pt-3">月末在庫（{preview.monthEnd}）</p>
                <SummaryRow label="📦 在庫合計" value={preview.inventoryTotal} bold border />
              </div>
            </div>

            <div className="bg-stone-800 rounded-2xl shadow-sm p-5 space-y-2">
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-stone-400 tracking-wider">📊 売上合計</span>
                <span className="text-2xl font-light text-white tabular-nums">¥{salesTotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-stone-400 tracking-wider">経費</span>
                <span className="text-base text-rose-300 tabular-nums">−¥{preview.expTotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-baseline pt-2 border-t border-stone-700">
                <span className="text-xs text-stone-400 tracking-wider">粗利</span>
                <span className="text-2xl font-light text-emerald-300 tabular-nums">¥{profit.toLocaleString()}</span>
              </div>
            </div>

            <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 text-xs text-stone-600 space-y-1">
              <p className="font-medium">📥 CSVファイルに含まれる内容</p>
              <p>1) 月次サマリー（4区分・Stripe・請求書・経費）</p>
              <p>2) 店舗 Square 売上明細（商品単位）</p>
              <p>3) EC Stripe 売上明細</p>
              <p>4) 業販請求書（入金確認済）</p>
              <p>5) 経費明細</p>
              <p>6) 銀行入出金（参考・売上合計には未加算）</p>
              <p>7) Square 入金（実額・対象期間・手数料）</p>
              <p>8) Stripe 入金（実額・対象期間・手数料）</p>
              <p>9) 月末在庫（食材・グッズ・資材）</p>
              <p className="text-[10px] text-stone-400 pt-1">UTF-8 BOM 付きで Excel でも文字化けしません</p>
            </div>
          </>
        ) : null}
      </div>
    </main>
  )
}

function SummaryRow({ label, value, bold, border, amber }: { label: string; value: number; bold?: boolean; border?: boolean; amber?: boolean }) {
  return (
    <div className={`flex justify-between items-baseline ${border ? 'pt-1 border-t border-stone-100' : ''} ${amber ? 'text-amber-700' : ''}`}>
      <span className={bold ? 'text-stone-800 font-medium' : 'text-stone-700'}>{label}</span>
      <span className={`tabular-nums ${bold ? 'text-stone-900 font-medium' : 'text-stone-800'}`}>¥{value.toLocaleString()}</span>
    </div>
  )
}
