/**
 * 日次cron: 店舗(Square)売上 → 物販在庫の自動減算。
 *
 * keiri 同期済みの keiri_square_line_items を走査し、inv_sku_channel_map(channel='square')
 * でマッピング済みの catalog_object_id だけ cafe_stock_events に store_sale を挿入する。
 * 既存trigger が keiri_sku_master.current_stock を減算。冪等(ref_source/ref_id 一意)。
 *
 * - マッピング0件なら何も減らない(正常)。マッピングが埋まるほど自動で効く。
 * - 未マッピングの売上はスキップ(エラーにしない)。
 *
 * 認証: Vercel Cron からの Authorization: Bearer ${CRON_SECRET}
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendTelegramMessage } from '@/lib/telegram'

export const runtime = 'nodejs'
export const maxDuration = 60

function authorize(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  return req.headers.get('authorization') === `Bearer ${expected}`
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function GET(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = admin()
  // 既定12週ぶんを再走査(冪等なので重複挿入なし)。
  const { data, error } = await supabase.rpc('inv_sync_store_sales_to_stock')

  if (error) {
    await sendTelegramMessage({
      text: `🔴 <b>店舗売上→在庫 同期に失敗</b>\ninv_sync_store_sales_to_stock() — ${error.message}`,
      parseMode: 'HTML',
    }).catch(() => {})
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  // data = 今回挿入した行数
  return NextResponse.json({ ok: true, inserted: data ?? 0 })
}
