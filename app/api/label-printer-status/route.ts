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
  return NextResponse.json({
    online: ageMs < STALE_MS,
    last_seen: status.last_seen,
    age_seconds: Math.round(ageMs / 1000),
    printer_reachable: status.printer_reachable,
    pending_jobs: pending ?? 0,
  })
}
