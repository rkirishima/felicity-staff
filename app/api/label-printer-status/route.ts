import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/server'
import { createServiceClient } from '@/lib/keiri/serviceClient'

// ラベルプリンタ (Pi) のハートビート状態 + キュー滞留数。ラベル印刷ページの
// オンライン/オフライン表示用。Pi の felicity-queue poller が 30秒ごとに
// label_printer_status.last_seen を更新している。

const STALE_MS = 2 * 60 * 1000 // 2分以上更新がなければオフライン扱い

export async function GET() {
  const denied = await requireAuth(); if (denied) return denied

  const supabase = createServiceClient()
  const [{ data: status }, { count: pending }] = await Promise.all([
    supabase.from('label_printer_status').select('*').eq('id', 1).single(),
    supabase.from('label_print_jobs').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ])

  if (!status) {
    return NextResponse.json({ online: false, error: 'no heartbeat row' }, { status: 200 })
  }

  const ageMs = Date.now() - new Date(status.last_seen).getTime()

  // プリンタ本体の不達。printer_reachable の瞬間値は印刷中にも false になるので、
  // 画面に出すのは監視cronが「継続している」と判定したもの(printer_alerted)だけ。
  const unreachableMin = status.printer_unreachable_since
    ? Math.round((Date.now() - new Date(status.printer_unreachable_since).getTime()) / 60000)
    : null

  return NextResponse.json({
    online: ageMs < STALE_MS,
    last_seen: status.last_seen,
    age_seconds: Math.round(ageMs / 1000),
    printer_reachable: status.printer_reachable,
    printer_down: status.printer_alerted === true,
    printer_unreachable_minutes: unreachableMin,
    pending_jobs: pending ?? 0,
  })
}
