import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// LINEへpush。成功可否とエラー本文を返す（既存cronは結果を握りつぶしていて失敗に気づけなかった）
async function sendLineMessage(message: string): Promise<{ ok: boolean; status: number; error?: string }> {
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      to: process.env.LINE_STAFF_GROUP_ID,
      messages: [{ type: 'text', text: message }],
    }),
  })
  if (res.ok) return { ok: true, status: res.status }
  const error = await res.text().catch(() => '')
  console.error(`[inventory-order-list] LINE push failed: ${res.status} ${error}`)
  return { ok: false, status: res.status, error }
}

type OrderRow = {
  item_id: string
  name: string
  category: string | null
  order_unit: string | null
  storage: string | null
  memo: string | null
  supplier_id: string | null
  status: 'reorder' | 'urgent'
  priority: number
}

// 「・牛乳 1L×6 [冷蔵] — ◯◯牛乳店」のような1行を組み立てる
function formatItem(it: OrderRow, supplierName?: string): string {
  const parts = [`・${it.name}`]
  if (it.order_unit) parts.push(it.order_unit)
  let line = parts.join(' ')
  if (it.storage) line += ` [${it.storage}]`
  if (supplierName) line += ` — ${supplierName}`
  if (it.memo) line += `（${it.memo}）`
  return line
}

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 買い付け対象（reorder/urgent、緊急優先）— inv_order_list ビューが状態判定・並び順を担当
  const { data: rows, error } = await sb
    .from('inv_order_list')
    .select('item_id, name, category, order_unit, storage, memo, supplier_id, status, priority')
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const orders = (rows ?? []) as OrderRow[]

  // 対象ゼロの日は通知しない（スパム防止）
  if (orders.length === 0) {
    return NextResponse.json({ sent: false, count: 0 })
  }

  // 発注先名をまとめて引いてマップ化
  const supplierIds = [...new Set(orders.map(o => o.supplier_id).filter(Boolean))] as string[]
  const supplierMap: Record<string, string> = {}
  if (supplierIds.length > 0) {
    const { data: suppliers } = await sb
      .from('inv_suppliers')
      .select('id, name')
      .in('id', supplierIds)
    for (const s of suppliers ?? []) supplierMap[s.id] = s.name
  }

  const urgent = orders.filter(o => o.status === 'urgent')
  const reorder = orders.filter(o => o.status === 'reorder')

  const today = new Date(Date.now() + 9 * 60 * 60 * 1000) // JST
  const dateStr = `${today.getMonth() + 1}/${today.getDate()}`

  const sections: string[] = []
  if (urgent.length > 0) {
    sections.push(`🔴 緊急\n${urgent.map(o => formatItem(o, o.supplier_id ? supplierMap[o.supplier_id] : undefined)).join('\n')}`)
  }
  if (reorder.length > 0) {
    sections.push(`🟠 発注ライン\n${reorder.map(o => formatItem(o, o.supplier_id ? supplierMap[o.supplier_id] : undefined)).join('\n')}`)
  }

  const msg =
    `🛒 本日の買い付けリスト (${dateStr})\n\n` +
    sections.join('\n\n') +
    `\n\n更新・チェックはアプリから👇\nhttps://felicity-staff.vercel.app/inventory`

  const result = await sendLineMessage(msg)

  return NextResponse.json({
    sent: result.ok,
    count: orders.length,
    urgent: urgent.length,
    reorder: reorder.length,
    ...(result.ok ? {} : { lineStatus: result.status, lineError: result.error }),
  }, { status: result.ok ? 200 : 502 })
}
