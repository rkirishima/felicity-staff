/**
 * 週次cron: Square売上の税率異常を検出してTelegram通知。
 *
 * - 直近7日間の keiri_square_line_items を集計
 * - 商品ごとの実効税率(tax_amount / gross_amount)を計算
 * - 11%超 = 二重課税疑い / 7%未満かつtax_rate>0 = 税未取得疑い
 * - 異常があれば Telegram 通知
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { sendTelegramMessage } from '@/lib/telegram'

export const runtime = 'nodejs'
export const maxDuration = 30

function authorize(req: NextRequest): boolean {
  const auth = req.headers.get('authorization')
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  return auth === `Bearer ${expected}`
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

type Row = {
  item_name: string
  catalog_object_id: string
  configured_rate: number | null
  total_gross: number
  total_tax: number
  effective_pct: number
  sales: number
  status: 'double_tax' | 'missing_tax' | 'rate_drift'
}

export async function GET(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = admin()
  const since = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10)

  // 直近7日の集計を直接SQLで(RPCではなく素直なクエリ)
  const { data: lines, error } = await supabase
    .from('keiri_square_line_items')
    .select('item_name, catalog_object_id, tax_rate, gross_amount, tax_amount')
    .gte('date', since)
    .not('item_name', 'is', null)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 集計(JS側)
  type Agg = { item_name: string; catalog_object_id: string; configured_rate: number | null; gross: number; tax: number; sales: number }
  const map = new Map<string, Agg>()
  for (const l of (lines ?? []) as any[]) {
    const key = `${l.catalog_object_id}`
    if (!map.has(key)) {
      map.set(key, {
        item_name: l.item_name,
        catalog_object_id: l.catalog_object_id,
        configured_rate: l.tax_rate,
        gross: 0,
        tax: 0,
        sales: 0,
      })
    }
    const cur = map.get(key)!
    cur.gross += l.gross_amount || 0
    cur.tax += l.tax_amount || 0
    cur.sales += 1
  }

  const anomalies: Row[] = []
  for (const a of map.values()) {
    if (a.gross <= 0) continue
    const eff = (a.tax / a.gross) * 100
    let status: Row['status'] | null = null
    if (eff > 11) status = 'double_tax'
    else if (eff < 1 && (a.configured_rate ?? 0) > 0) status = 'missing_tax'
    else if (a.configured_rate !== null && Math.abs(eff - a.configured_rate) > 1.5 && eff > 1) status = 'rate_drift'
    if (status) {
      anomalies.push({
        item_name: a.item_name,
        catalog_object_id: a.catalog_object_id,
        configured_rate: a.configured_rate,
        total_gross: a.gross,
        total_tax: a.tax,
        effective_pct: Math.round(eff * 10) / 10,
        sales: a.sales,
        status,
      })
    }
  }

  let telegramResult: any = { skipped: true }
  if (anomalies.length > 0) {
    const lines: string[] = [
      `⚠️ <b>Square税率異常 ${anomalies.length}件 (直近7日)</b>`,
      '',
    ]
    for (const a of anomalies.slice(0, 20)) {
      const icon = a.status === 'double_tax' ? '🔴' : a.status === 'missing_tax' ? '❌' : '⚠'
      lines.push(`${icon} ${a.item_name} — 設定${a.configured_rate ?? '?'}% / 実効${a.effective_pct}% (${a.sales}件¥${a.total_gross.toLocaleString()})`)
    }
    if (anomalies.length > 20) {
      lines.push(`...他 ${anomalies.length - 20}件`)
    }
    lines.push('', '対処: Square商品設定で税カテゴリを修正')
    telegramResult = await sendTelegramMessage({ text: lines.join('\n'), parseMode: 'HTML' })
  }

  return NextResponse.json({
    ok: true,
    since,
    items_checked: map.size,
    anomalies: anomalies.length,
    detail: anomalies,
    telegram: telegramResult,
  })
}
