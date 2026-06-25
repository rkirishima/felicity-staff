/**
 * 日次cron: 在庫予想の夜間更新。
 *
 * Supabase の inv_nightly_refresh() RPC を呼ぶだけ。
 * RPC 側で「メニュー同期 + 需要予想(forecasts)の再生成」が走る。
 * 売上(inv_sales_lines)は keiri 経由で別途同期済みなので、ここでは取り込みはしない。
 *
 * 認証: Vercel Cron からの Authorization: Bearer ${CRON_SECRET}
 * 失敗時のみ Telegram(Doug) に通知して気付けるようにする。
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
  const { data, error } = await supabase.rpc('inv_nightly_refresh')

  if (error) {
    // 失敗は気付きたいので Telegram 通知
    await sendTelegramMessage({
      text: `🔴 <b>在庫予想の夜間更新に失敗</b>\ninv_nightly_refresh() — ${error.message}`,
      parseMode: 'HTML',
    }).catch(() => {})
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  // RPC は処理結果メッセージ(text)を返す想定
  return NextResponse.json({ ok: true, result: data ?? null })
}
