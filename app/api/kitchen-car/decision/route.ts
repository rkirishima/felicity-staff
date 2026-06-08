import { createClient } from '@supabase/supabase-js'
import { verifyDecision, kcDateLabel, sendStaffLine } from '@/lib/kitchenCar'

export const runtime = 'nodejs'

// Telegramのリンクボタンから叩かれる確定エンドポイント（GET）。
// 署名(sig)を検証し、cancel ならキッチンカー枠に中止マークを付けて
// スタッフLINEグループへ告知する。keep なら何もせず開催のまま。

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

function page(title: string, body: string): Response {
  const html =
    '<!doctype html><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<div style="font-family:system-ui,-apple-system,sans-serif;max-width:420px;margin:64px auto;padding:24px;text-align:center;background:#F5F0E8;border-radius:16px">' +
    `<div style="font-size:40px;margin-bottom:8px">🚐</div>` +
    `<h2 style="color:#1c1917;margin:0 0 8px">${title}</h2>` +
    `<p style="color:#57534e;line-height:1.6">${body}</p>` +
    '</div>'
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const d = url.searchParams.get('d') ?? ''
  const a = url.searchParams.get('a') ?? ''
  const sig = url.searchParams.get('sig') ?? ''

  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || (a !== 'cancel' && a !== 'keep') || !verifyDecision(d, a, sig)) {
    return page('リンクが無効です', 'もう一度 Telegram のボタンから操作してください。')
  }

  const label = kcDateLabel(d)

  if (a === 'keep') {
    return page('✅ 開催のままにしました', `${label} のキッチンカーは予定どおり開催です。`)
  }

  // cancel
  const { data: kc } = await sb
    .from('shifts')
    .select('id, note')
    .eq('date', d)
    .eq('location', 'kitchen_car')
    .eq('status', 'approved')

  if (!kc || kc.length === 0) {
    return page('対象がありません', `${label} のキッチンカー枠が見つかりませんでした。`)
  }
  if (kc.some(s => (s.note ?? '').includes('雨天中止'))) {
    return page('既に中止済みです', `${label} のキッチンカーは既に中止連絡済みです。`)
  }

  // 各枠に中止マークを付ける
  for (const s of kc) {
    const note = `${(s.note ?? '').trim()} 🌧雨天中止`.trim()
    await sb.from('shifts').update({ note }).eq('id', s.id)
  }

  // スタッフLINEグループへ告知（荒井さんへ名指し）
  const msg =
    `🚐☔️ キッチンカー中止のお知らせ\n\n` +
    `荒井さん、${label} のキッチンカーは雨予報のため中止します。\n` +
    `他の皆さんもご確認ください。よろしくお願いします🙏`
  const sent = await sendStaffLine(msg)

  return page(
    sent ? '🚫 中止をスタッフに告知しました' : '🚫 中止にしました',
    sent
      ? `${label} のキッチンカーを中止にし、LINEスタッフグループへ通知しました。`
      : `${label} のキッチンカーを中止にしました（LINE設定が無いため自動通知はスキップ）。`,
  )
}
