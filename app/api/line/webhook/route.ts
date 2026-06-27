import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// 正しい LINE_STAFF_GROUP_ID を採取するための受信口。
// グループ内の発言や bot の join イベントから source(groupId) を app_settings に記録する。
// 採取後はこのルートと LINE 側 webhook 設定を外してよい（恒久運用なら署名検証を追加すること）。

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CAPTURE_KEY = 'line_captured_source'

type LineSource = { type?: string; groupId?: string; roomId?: string; userId?: string }

export async function POST(req: Request) {
  let body: { events?: { type?: string; source?: LineSource }[] } = {}
  try { body = await req.json() } catch {}
  const events = Array.isArray(body.events) ? body.events : []
  const sources = events.map(e => e.source).filter((s): s is LineSource => !!s)

  if (sources.length > 0) {
    await sb.from('app_settings').upsert(
      {
        key: CAPTURE_KEY,
        value: JSON.stringify({
          at: new Date().toISOString(),
          latest: sources[sources.length - 1],
          eventTypes: events.map(e => e.type),
        }),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    )
  }

  // LINE は 200 を返さないとリトライ/webhook無効化するため常に 200
  return NextResponse.json({ ok: true })
}

// 採取結果の確認用（CRON_SECRET で保護）
export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { data } = await sb.from('app_settings').select('value, updated_at').eq('key', CAPTURE_KEY).single()
  return NextResponse.json({
    captured: data?.value ? JSON.parse(data.value) : null,
    updated_at: data?.updated_at ?? null,
  })
}
