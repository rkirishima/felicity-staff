import { NextResponse, after } from 'next/server'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { extractPayableFromDocument } from '@/lib/keiri/extractPayableFromDocument'
import { sendTelegramMessage } from '@/lib/telegram'

export const runtime = 'nodejs'
export const maxDuration = 60

// LINE公式アカウント (@felicity_hayama) の webhook。
// 用途: 登録済みユーザーが送った請求書の画像/PDF を Claude でOCR抽出し
// keiri_payables に登録する (LINE経由で届く請求書の受け口)。
//
// 公式アカウントはお客様も触れるため、取込は許可ユーザーのみ:
// - 「請求書受付登録」(env LINE_INVOICE_REGISTER_PHRASE で変更可) とテキスト送信
//   → その userId を app_settings 'line_invoice_users' に登録
// - 登録ユーザーの image / file メッセージのみ処理。他は無視 (返信もしない)
//
// env: LINE_CHANNEL_ACCESS_TOKEN (必須) / LINE_CHANNEL_SECRET (署名検証、推奨)

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const ALLOWLIST_KEY = 'line_invoice_users'
const REGISTER_PHRASE = process.env.LINE_INVOICE_REGISTER_PHRASE || '請求書受付登録'
const LINE_API = 'https://api.line.me/v2/bot'
const LINE_DATA_API = 'https://api-data.line.me/v2/bot'

type LineSource = { type?: string; groupId?: string; roomId?: string; userId?: string }
type LineEvent = {
  type?: string
  replyToken?: string
  source?: LineSource
  message?: {
    id?: string
    type?: string // text | image | file | ...
    text?: string
    fileName?: string
  }
}

async function loadAllowlist(): Promise<string[]> {
  const { data } = await sb.from('app_settings').select('value').eq('key', ALLOWLIST_KEY).maybeSingle()
  if (!data?.value) return []
  try {
    const v = JSON.parse(data.value as string)
    return Array.isArray(v) ? (v as string[]) : []
  } catch {
    return []
  }
}

async function saveAllowlist(ids: string[]): Promise<void> {
  await sb.from('app_settings').upsert(
    { key: ALLOWLIST_KEY, value: JSON.stringify(ids), updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )
}

async function lineReply(replyToken: string, text: string): Promise<void> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
  if (!token) return
  await fetch(`${LINE_API}/message/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ replyToken, messages: [{ type: 'text', text: text.slice(0, 4900) }] }),
  }).catch(() => {})
}

async function linePush(userId: string, text: string): Promise<void> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
  if (!token) return
  await fetch(`${LINE_API}/message/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to: userId, messages: [{ type: 'text', text: text.slice(0, 4900) }] }),
  }).catch(() => {})
}

async function downloadLineContent(messageId: string): Promise<{ buf: Buffer; mime: string } | null> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
  if (!token) return null
  const res = await fetch(`${LINE_DATA_API}/message/${messageId}/content`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  const mime = res.headers.get('content-type') ?? 'application/octet-stream'
  return { buf: Buffer.from(await res.arrayBuffer()), mime }
}

async function processInvoiceMessage(ev: LineEvent): Promise<void> {
  const messageId = ev.message?.id
  const userId = ev.source?.userId
  if (!messageId || !userId) return

  // 二重処理防止 (LINEはwebhookをリトライすることがある)
  const { data: seen } = await sb
    .from('keiri_line_processed')
    .select('message_id')
    .eq('message_id', messageId)
    .maybeSingle()
  if (seen) return

  const mark = (status: string, reason: string | null, payableId?: string) =>
    sb.from('keiri_line_processed').insert({
      message_id: messageId,
      line_user_id: userId,
      status,
      reason,
      payable_id: payableId ?? null,
    })

  const content = await downloadLineContent(messageId)
  if (!content) {
    await mark('error', 'content download failed')
    await linePush(userId, '⚠️ ファイルの取得に失敗しました。もう一度送ってください。')
    return
  }
  // LINEのfileメッセージはcontent-typeが application/octet-stream のことがあるので拡張子で補正
  let mime = content.mime.split(';')[0]
  if (mime === 'application/octet-stream' && ev.message?.fileName?.toLowerCase().endsWith('.pdf')) {
    mime = 'application/pdf'
  }

  const result = await extractPayableFromDocument({
    fileName: ev.message?.fileName ?? `${messageId}.${mime.includes('pdf') ? 'pdf' : 'jpg'}`,
    mimeType: mime,
    base64: content.buf.toString('base64'),
  })

  if (!result || result.confidence === 'low' || result.amount === null || !result.vendor) {
    await mark('skipped', result ? `low_confidence: ${result.notes ?? ''}` : 'extraction_failed')
    await linePush(
      userId,
      `⚠️ 請求書として読み取れませんでした${result?.notes ? `（${result.notes}）` : ''}。鮮明な写真かPDFでもう一度お試しください。`,
    )
    return
  }
  if (result.amount === 0) {
    await mark('skipped', `繰越請求: ${result.notes ?? ''}`)
    await linePush(userId, `ℹ️ 繰越請求（新規買上なし）のため登録をスキップしました: ${result.vendor}`)
    return
  }

  if (result.invoice_number) {
    const { data: dup } = await sb
      .from('keiri_payables')
      .select('id')
      .eq('invoice_number', result.invoice_number)
      .eq('amount', result.amount)
      .limit(1)
      .maybeSingle()
    if (dup) {
      await mark('skipped', 'invoice_number duplicate', dup.id as string)
      await linePush(userId, `ℹ️ 既に登録済みの請求書です: ${result.vendor} ¥${result.amount.toLocaleString()}`)
      return
    }
  }

  let dueDate = result.due_date
  if (!dueDate) {
    const base = result.order_date ? new Date(result.order_date + 'T00:00:00+09:00') : new Date()
    base.setUTCDate(base.getUTCDate() + 30)
    dueDate = base.toISOString().slice(0, 10)
  }

  const { data: insRow, error: insErr } = await sb
    .from('keiri_payables')
    .insert({
      vendor: result.vendor,
      description: result.description,
      amount: result.amount,
      invoice_number: result.invoice_number,
      order_date: result.order_date,
      due_date: dueDate,
      status: 'pending',
      source: 'line_auto',
      source_email_id: messageId, // LINE message id を流用
      source_email_subject: ev.message?.fileName ?? 'LINE画像',
      source_email_from: `line:${userId}`,
      notes: result.notes,
      created_by: 'line-webhook',
    })
    .select('id')
    .single()
  if (insErr) {
    await mark('error', `insert failed: ${insErr.message}`)
    await linePush(userId, '⚠️ 登録に失敗しました。管理画面から手動登録してください。')
    return
  }
  await mark('ok', null, insRow.id as string)

  await linePush(
    userId,
    `📥 請求書を登録しました\n${result.vendor}  ¥${result.amount.toLocaleString()}\n期日 ${dueDate}${result.invoice_number ? `\n請求書番号 ${result.invoice_number}` : ''}`,
  )
  await sendTelegramMessage({
    text: `📥 LINE経由で請求書取込: ${result.vendor} ¥${result.amount.toLocaleString()} 期日${dueDate}`,
  }).catch(() => {})
}

export async function POST(req: Request) {
  const bodyText = await req.text()

  // 署名検証 (LINE_CHANNEL_SECRET があれば必須チェック)
  const secret = process.env.LINE_CHANNEL_SECRET
  if (secret) {
    const sig = req.headers.get('x-line-signature') ?? ''
    const expected = crypto.createHmac('sha256', secret).update(bodyText).digest('base64')
    if (sig !== expected) {
      return NextResponse.json({ error: 'bad signature' }, { status: 403 })
    }
  }

  let body: { events?: LineEvent[] } = {}
  try {
    body = JSON.parse(bodyText)
  } catch {}
  const events = Array.isArray(body.events) ? body.events : []
  if (events.length === 0) return NextResponse.json({ ok: true })

  const allowlist = await loadAllowlist()
  const heavy: LineEvent[] = []

  for (const ev of events) {
    const userId = ev.source?.userId
    if (ev.type !== 'message' || !userId) continue

    // 登録フレーズ: 合言葉を送った人を請求書窓口に登録
    if (ev.message?.type === 'text') {
      const text = (ev.message.text ?? '').trim()
      if (text === REGISTER_PHRASE) {
        if (!allowlist.includes(userId)) {
          allowlist.push(userId)
          await saveAllowlist(allowlist)
          await sendTelegramMessage({
            text: `🆕 LINE請求書窓口にユーザー登録: ${userId}`,
          }).catch(() => {})
        }
        if (ev.replyToken) {
          await lineReply(ev.replyToken, '✅ 請求書窓口として登録しました。請求書の写真またはPDFをこのトークに送ると自動で経理に登録されます。')
        }
      }
      continue // その他のテキストは無視 (お客様のメッセージに反応しない)
    }

    // 画像/ファイルは登録ユーザーのみ処理
    if ((ev.message?.type === 'image' || ev.message?.type === 'file') && allowlist.includes(userId)) {
      heavy.push(ev)
    }
  }

  // LINE には即時 200 を返し、OCR はレスポンス後に処理 (リトライによる二重処理は台帳で防止)
  if (heavy.length > 0) {
    after(async () => {
      for (const ev of heavy) {
        try {
          await processInvoiceMessage(ev)
        } catch (e) {
          console.error('[line-webhook] process failed:', e)
        }
      }
    })
  }

  return NextResponse.json({ ok: true })
}
