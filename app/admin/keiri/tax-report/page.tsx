'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getAdminSession } from '@/lib/session'
import { effectiveRevenueCategory, type RevenueCategory } from '@/lib/keiri/classifyRevenue'
import { LoadError } from '@/components/keiri/LoadError'

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

type SquarePayoutRow = {
  payout_id: string
  completed_at: string | null
  amount: number
  fee_amount: number
  gross_amount: number
  period_start: string | null
  period_end: string | null
}

type StripePayoutRow = {
  payout_id: string
  arrival_date: string | null
  amount: number
  fee_amount: number
  gross_amount: number
  charge_count: number
  refund_count: number
  period_start: string | null
  period_end: string | null
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
  squarePayouts: SquarePayoutRow[]
  stripePayouts: StripePayoutRow[]
}

export default function TaxReportPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const months = useMemo(() => monthOptions(36), [])
  const [month, setMonth] = useState(thisMonthJST())
  const [preview, setPreview] = useState<Preview | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)

  useEffect(() => {
    if (!getAdminSession()) router.replace('/admin')
  }, [router])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setLoadErr(null)
      const start = `${month}-01`
      const [y, m] = month.split('-').map(s => parseInt(s, 10))
      const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
      const end = `${nextMonth}-01`
      const beginIso = new Date(`${month}-01T00:00:00+09:00`).toISOString()
      const endIso = new Date(`${nextMonth}-01T00:00:00+09:00`).toISOString()

      const monthEndDate = new Date(`${nextMonth}-01T00:00:00+09:00`)
      monthEndDate.setUTCDate(monthEndDate.getUTCDate() - 1)
      const monthEndStr = monthEndDate.toISOString().slice(0, 10)

      const [sqRes, stripeRes, invRes, expRes, bankRes, ordRes, ovRes, inventoryRes, sqPayoutRes, stPayoutRes] = await Promise.all([
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
        supabase.from('keiri_square_payouts')
          .select('payout_id, completed_at, amount, fee_amount, gross_amount, period_start, period_end')
          .gte('completed_at', beginIso).lt('completed_at', endIso)
          .order('completed_at'),
        supabase.from('keiri_stripe_payouts')
          .select('payout_id, arrival_date, amount, fee_amount, gross_amount, charge_count, refund_count, period_start, period_end')
          .gte('arrival_date', start).lt('arrival_date', end)
          .order('arrival_date'),
      ])
      if (cancelled) return

      const firstErr = [sqRes, stripeRes, invRes, expRes, bankRes, ordRes, ovRes, inventoryRes, sqPayoutRes, stPayoutRes].map(r => r?.error).find(Boolean)
      setLoadErr(firstErr ? firstErr.message : null)

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
        squarePayouts: (sqPayoutRes?.data ?? []) as SquarePayoutRow[],
        stripePayouts: (stPayoutRes?.data ?? []) as StripePayoutRow[],
      })
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [month, supabase])

  function downloadCsv(section?: string) {
    const q = section ? `&section=${section}` : ''
    window.location.href = `/api/keiri/tax-report/csv?month=${month}${q}`
  }
  function downloadPdf(section?: string) {
    const q = section ? `&section=${section}` : ''
    window.location.href = `/api/keiri/tax-report/pdf?month=${month}${q}`
  }

  const salesTotal = preview ? preview.sqTotal + preview.orderTotal + preview.invTotal : 0
  const profit = preview ? salesTotal - preview.expTotal : 0

  return (
    <main className="min-h-screen pb-24 px-4 pt-8" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="max-w-lg mx-auto space-y-3">
        <div className="flex items-center justify-between">
          <button onClick={() => router.push('/admin/keiri')} className="text-stone-500 text-sm">← 戻る</button>
          <h1 className="text-lg font-semibold tracking-wider text-stone-800">税理士コーナー</h1>
          <div className="w-12" />
        </div>

        <LoadError message={loadErr} />

        <select
          value={month}
          onChange={e => setMonth(e.target.value)}
          className="w-full bg-white rounded-xl px-3 py-2 text-sm border border-stone-200"
        >
          {months.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <div className="bg-stone-50 border border-stone-200 rounded-2xl p-3">
          <p className="text-[10px] text-stone-500 mb-2">📥 月次全体（全セクション一括）</p>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => downloadCsv()} className="bg-stone-800 text-white py-2.5 rounded-xl text-sm font-medium">📄 CSV 全体</button>
            <button onClick={() => downloadPdf()} className="bg-rose-700 text-white py-2.5 rounded-xl text-sm font-medium">🗎 PDF 全体</button>
          </div>
        </div>

        {loading ? (
          <p className="text-center text-stone-400 text-sm py-12">読み込み中…</p>
        ) : preview ? (
          <>
            {/* 月次サマリー */}
            <SectionCard
              title="① 月次サマリー"
              onCsv={() => downloadCsv('summary')}
              onPdf={() => downloadPdf('summary')}
            >
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
            </SectionCard>

            {/* Totals */}
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

            {/* Square 入金 */}
            <PayoutsSection
              title="② 店舗 Square 入金（毎週金曜）"
              payouts={preview.squarePayouts.map(p => ({
                key: p.payout_id,
                date: p.completed_at,
                period_start: p.period_start,
                period_end: p.period_end,
                gross_amount: p.gross_amount,
                fee_amount: p.fee_amount,
                amount: p.amount,
              }))}
              onCsv={() => downloadCsv('square-payouts')}
              onPdf={() => downloadPdf('square-payouts')}
            />

            {/* Stripe 入金 */}
            <PayoutsSection
              title="③ EC Stripe 入金"
              payouts={preview.stripePayouts.map(p => ({
                key: p.payout_id,
                date: p.arrival_date,
                period_start: p.period_start,
                period_end: p.period_end,
                gross_amount: p.gross_amount,
                fee_amount: p.fee_amount,
                amount: p.amount,
                extra: p.charge_count > 0 || p.refund_count > 0
                  ? `${p.charge_count > 0 ? `${p.charge_count}件` : ''}${p.refund_count > 0 ? ` 返金${p.refund_count}件` : ''}`
                  : null,
              }))}
              onCsv={() => downloadCsv('stripe-payouts')}
              onPdf={() => downloadPdf('stripe-payouts')}
            />

            {/* Square 商品ライン */}
            <SectionCard
              title="④ 店舗 Square 売上明細（商品単位）"
              subtitle="日次・商品名・数量・税抜金額・消費税・税率・区分"
              onCsv={() => downloadCsv('square-lines')}
              onPdf={() => downloadPdf('square-lines')}
            />

            {/* Stripe 商品ライン */}
            <SectionCard
              title="⑤ EC Stripe 売上明細"
              subtitle="日次・商品ID・商品名・数量・金額・税率・分類"
              onCsv={() => downloadCsv('stripe-lines')}
              onPdf={() => downloadPdf('stripe-lines')}
            />

            {/* 業販請求書 */}
            <SectionCard
              title="⑥ 業販請求書（入金確認済）"
              subtitle="請求書番号・発行日・入金日・請求先・税抜・消費税・合計"
              onCsv={() => downloadCsv('invoices')}
              onPdf={() => downloadPdf('invoices')}
            />

            {/* 経費 */}
            <SectionCard
              title="⑦ 経費明細"
              subtitle="日付・勘定科目・取引先・摘要・金額・消費税・税区分・支払方法"
              onCsv={() => downloadCsv('expenses')}
              onPdf={() => downloadPdf('expenses')}
            />

            {/* 銀行 */}
            <SectionCard
              title="⑧ 銀行入出金（参考）"
              subtitle="日付・摘要・出金・入金・残高"
              onCsv={() => downloadCsv('bank')}
              onPdf={() => downloadPdf('bank')}
            />

            {/* 在庫 */}
            <SectionCard
              title="⑨ 月末在庫"
              subtitle={`${preview.monthEnd} 時点 — カテゴリ・品名・単価・残数・単位・小計`}
              onCsv={() => downloadCsv('inventory')}
              onPdf={() => downloadPdf('inventory')}
            />

            <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 text-xs text-stone-600 space-y-1">
              <p className="font-medium">📥 内容</p>
              <p>CSV：UTF-8 BOM 付き、Excel で文字化けなし</p>
              <p>PDF：A4・FELICITYロゴ・会社情報付き</p>
              <p>各セクション個別 or 全体一括 のいずれもOK</p>
            </div>
          </>
        ) : null}
      </div>
    </main>
  )
}

function SectionCard({
  title, subtitle, onCsv, onPdf, children,
}: {
  title: string
  subtitle?: string
  onCsv: () => void
  onPdf: () => void
  children?: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-stone-800">{title}</p>
          {subtitle && <p className="text-[10px] text-stone-400 mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex gap-1.5 shrink-0">
          <button onClick={onCsv} className="text-xs px-2.5 py-1.5 bg-stone-800 text-white rounded-lg whitespace-nowrap">📄 CSV</button>
          <button onClick={onPdf} className="text-xs px-2.5 py-1.5 bg-rose-700 text-white rounded-lg whitespace-nowrap">🗎 PDF</button>
        </div>
      </div>
      {children && <div className="space-y-1.5 text-sm pt-1 border-t border-stone-100">{children}</div>}
    </div>
  )
}

type PayoutDisplay = {
  key: string
  date: string | null
  period_start: string | null
  period_end: string | null
  gross_amount: number
  fee_amount: number
  amount: number
  extra?: string | null
}

function PayoutsSection({
  title, payouts, onCsv, onPdf,
}: {
  title: string
  payouts: PayoutDisplay[]
  onCsv: () => void
  onPdf: () => void
}) {
  const grossTotal = payouts.reduce((s, p) => s + p.gross_amount, 0)
  const feeTotal = payouts.reduce((s, p) => s + p.fee_amount, 0)
  const netTotal = payouts.reduce((s, p) => s + p.amount, 0)

  return (
    <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-stone-800">{title}</p>
          <p className="text-[10px] text-stone-400 mt-0.5">売上総額 → 差引手数料 → 実入金額 を入金ごとに</p>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <button onClick={onCsv} className="text-xs px-2.5 py-1.5 bg-stone-800 text-white rounded-lg whitespace-nowrap">📄 CSV</button>
          <button onClick={onPdf} className="text-xs px-2.5 py-1.5 bg-rose-700 text-white rounded-lg whitespace-nowrap">🗎 PDF</button>
        </div>
      </div>

      {/* 月内サマリー: 売上 / 手数料 / 実入金額 を3カラムで大きく明示 */}
      {payouts.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-stone-50 rounded-xl p-2.5 text-center">
            <p className="text-[10px] text-stone-500">売上総額</p>
            <p className="text-sm font-medium text-stone-800 tabular-nums mt-0.5">¥{grossTotal.toLocaleString()}</p>
          </div>
          <div className="bg-rose-50 rounded-xl p-2.5 text-center border border-rose-100">
            <p className="text-[10px] text-rose-700">差引手数料</p>
            <p className="text-sm font-medium text-rose-900 tabular-nums mt-0.5">−¥{feeTotal.toLocaleString()}</p>
          </div>
          <div className="bg-emerald-50 rounded-xl p-2.5 text-center border border-emerald-200">
            <p className="text-[10px] text-emerald-700">実入金額</p>
            <p className="text-sm font-medium text-emerald-900 tabular-nums mt-0.5">¥{netTotal.toLocaleString()}</p>
          </div>
        </div>
      )}

      {payouts.length === 0 ? (
        <p className="text-xs text-stone-400 text-center py-3">この月の入金記録はありません</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {payouts.map(p => (
            <li key={p.key} className="border-t border-stone-100 pt-2 first:border-0 first:pt-0">
              <div className="flex justify-between items-baseline">
                <span className="text-stone-700">
                  振込 {p.date ? new Date(p.date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', timeZone: 'Asia/Tokyo' }) : '—'}
                </span>
                <span className="tabular-nums text-stone-900 font-medium">
                  ¥{p.amount.toLocaleString()}
                </span>
              </div>
              <div className="text-[11px] text-stone-500 flex justify-between mt-0.5">
                <span>
                  {p.period_start && p.period_end ? `対象期間 ${p.period_start.slice(5)}〜${p.period_end.slice(5)}` : '対象期間 —'}
                  {p.extra && <span className="text-stone-400 ml-2">{p.extra}</span>}
                </span>
                <span className="tabular-nums">
                  売上 ¥{p.gross_amount.toLocaleString()} − 手数料 ¥{p.fee_amount.toLocaleString()}
                </span>
              </div>
            </li>
          ))}
          <li className="border-t border-stone-200 pt-2 mt-1 space-y-0.5 text-sm">
            <div className="flex justify-between font-medium">
              <span className="text-stone-700">月内 入金合計</span>
              <span className="tabular-nums text-stone-900">¥{netTotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-xs text-stone-500">
              <span>売上総額 ¥{grossTotal.toLocaleString()}</span>
              <span>手数料合計 ¥{feeTotal.toLocaleString()}</span>
            </div>
          </li>
        </ul>
      )}
    </div>
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
