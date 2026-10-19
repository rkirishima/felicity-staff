import { NextResponse } from 'next/server'
import { isAuthorizedCron } from '@/lib/cronAuth'
import { createServiceClient } from '@/lib/keiri/serviceClient'
import { sendTelegramMessage } from '@/lib/telegram'

// Probat 取り込み（Mac mini の sync-probat.js）の外形監視。1時間ごと。
//
// sync-probat.js 自身も Telegram で鳴らすが、Mac mini ごと止まる・ネットが切れると
// その通知も出ない。2026-10-15〜19 に実際そうなり、4日間誰も気づかなかった
// （Tailscale 終了で Mac mini のネットが落ちたのが原因とみられる）。
// なのでクラウド側から2つだけ見る:
//
//  1. stale   : probat_sync_status.checked_at が12時間以上更新されていない
//               = Mac mini のスクリプトが動いていない。焙煎機オフの日も
//                 スクリプトは 'unreachable' を書き続けるので、これは誤報にならない。
//  2. missing : 焙煎ログ（直近7日）にカーブが付いていないのに、その焙煎の
//               30分以上後に取り込みが 'ok' で回っている
//               = 焙煎機は見えているのにカーブが入っていない / 紐付いていない。
//               焙煎機を切った後は last_ok_at が進まないので、翌日オンにするまで鳴らない。
//
// 同じ内容で何度も鳴らさないよう monitor_alert_key に直近の通知内容を持ち、
// 変わったときだけ通知する。解消したら復旧を1回通知する。
// （sync-probat.js は merge-duplicates で自分の列だけ upsert するので、この列は消されない）

const STALE_MS = 12 * 60 * 60 * 1000
const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000
const GRACE_MS = 30 * 60 * 1000

// sendTelegramMessage は HTML モード。エラーメッセージ等に < & が入りうるので逃がす
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const jst = (iso: string) =>
  new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(5, 16).replace('T', ' ')

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const { data: status, error } = await supabase
    .from('probat_sync_status')
    .select('checked_at, status, message, last_ok_at, monitor_alert_key')
    .eq('id', 'p05')
    .single()
  if (error || !status) {
    return NextResponse.json({ error: error?.message ?? 'no status row' }, { status: 500 })
  }

  const now = Date.now()
  let key: string | null = null
  let text = ''

  const ageMs = now - new Date(status.checked_at).getTime()
  if (ageMs > STALE_MS) {
    key = 'stale'
    text =
      `⚠️ Probat 取り込みが ${Math.floor(ageMs / 3600000)} 時間止まっています\n` +
      `最終記録: ${jst(status.checked_at)}（${status.status}: ${esc((status.message ?? '').slice(0, 100))}）\n` +
      `Mac mini がスリープ・ネット切断・停止していないか確認し、だめなら再起動してください。\n` +
      `焙煎機に履歴が残っているので、復旧すれば焙煎データは自動で取り込まれます。`
  } else if (status.last_ok_at) {
    const since = new Date(now - LOOKBACK_MS).toISOString()
    const before = new Date(new Date(status.last_ok_at).getTime() - GRACE_MS).toISOString()
    const { data: logs, error: logErr } = await supabase
      .from('roast_logs')
      .select('id, roasted_at, bean_id, green_kg, roast_curves(id)')
      .gte('roasted_at', since)
      .lte('roasted_at', before)
      .order('roasted_at', { ascending: true })
    if (logErr) {
      return NextResponse.json({ error: logErr.message }, { status: 500 })
    }
    const missing = (logs ?? []).filter((l) => !(l.roast_curves as unknown as { id: string }[] | null)?.length)
    if (missing.length) {
      key = 'missing:' + missing.map((l) => l.id).join(',')
      text =
        `⚠️ 焙煎データが付いていない焙煎ログが ${missing.length} 件あります\n` +
        missing.map((l) => `・${jst(l.roasted_at)} ${esc(l.bean_id ?? '?')} ${l.green_kg}kg`).join('\n') +
        `\n取り込みは動いています。焙煎ページで未紐付けのカーブがないか確認してください。`
    }
  }

  if (key === (status.monitor_alert_key ?? null)) {
    return NextResponse.json({ ok: key === null, alert: key ? 'already' : null })
  }

  if (key) {
    const sent = await sendTelegramMessage({ text })
    if (!sent.ok) return NextResponse.json({ error: sent.error }, { status: 502 })
  } else {
    await sendTelegramMessage({ text: '✅ Probat 取り込みの異常は解消しました' })
  }
  await supabase.from('probat_sync_status').update({ monitor_alert_key: key }).eq('id', 'p05')
  return NextResponse.json({ ok: key === null, alert: key ? 'sent' : 'recovered' })
}
