/**
 * Telegram bot ヘルパー。既存の felicity-staff Botトークンと chat_id を流用。
 *
 * env優先順位:
 *   TELEGRAM_BOT_TOKEN      — 必須(@BotFather)
 *   TELEGRAM_INVOICE_CHAT_ID → TELEGRAM_CHAT_ID → TELEGRAM_ORDERS_CHAT_ID
 *
 * envが未設定ならno-opで成功扱い(devで邪魔しない)。
 */

const API = 'https://api.telegram.org'

export type TelegramSendResult =
  | { ok: true; messageId?: number; skipped?: boolean }
  | { ok: false; error: string }

export async function sendTelegramMessage(opts: {
  text: string
  parseMode?: 'HTML' | 'MarkdownV2'
  disablePreview?: boolean
}): Promise<TelegramSendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId =
    process.env.TELEGRAM_INVOICE_CHAT_ID ||
    process.env.TELEGRAM_CHAT_ID ||
    process.env.TELEGRAM_ORDERS_CHAT_ID
  if (!token || !chatId) {
    console.warn('[telegram] TELEGRAM_BOT_TOKEN/CHAT_ID not set; skipping notification')
    return { ok: true, skipped: true }
  }
  try {
    const res = await fetch(`${API}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: opts.text,
        parse_mode: opts.parseMode ?? 'HTML',
        disable_web_page_preview: opts.disablePreview ?? false,
      }),
    })
    const json = await res.json()
    if (!json.ok) return { ok: false, error: json.description ?? 'unknown' }
    return { ok: true, messageId: json.result?.message_id }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
