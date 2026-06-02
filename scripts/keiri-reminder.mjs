#!/usr/bin/env node
// 毎月3日 09:00 JST に前月分の経理CSVダウンロードを促すTelegramリマインダー。
// Mac mini の crontab から起動する。依存なし、Node 標準 fetch のみ。
//
// env:
//   TELEGRAM_BOT_TOKEN  — @BotFather で取得した bot トークン
//   TELEGRAM_CHAT_ID    — 自分のchat_id（@userinfobot に /start で取得）
//
// 使い方:
//   node --env-file=.env scripts/keiri-reminder.mjs

const token = process.env.TELEGRAM_BOT_TOKEN
const chatId = process.env.TELEGRAM_CHAT_ID

if (!token || !chatId) {
  console.error('TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set in env')
  process.exit(1)
}

// JST の「前月」を実行日から動的に算出
const nowJst = new Date(Date.now() + 9 * 60 * 60 * 1000)
const prev = new Date(Date.UTC(nowJst.getUTCFullYear(), nowJst.getUTCMonth() - 1, 1))
const label = `${prev.getUTCFullYear()}年${prev.getUTCMonth() + 1}月`

const text = [
  `📥 *経理CSVダウンロード*（${label}分）`,
  '',
  '先月分が締まりました。3点まとめて落として keiri に取り込み。',
  '',
  '1️⃣ 住信SBI 入出金明細CSV',
  '   https://www.netbk.co.jp/',
  '2️⃣ Amazonビジネス 注文レポートCSV',
  '   https://business.amazon.co.jp/',
  '3️⃣ ETC利用照会 CSV',
  '   https://www.etc-meisai.jp/',
  '',
  '→ ~/Projects/felicity-web/keiri/imports/ に保存',
  '→ keiriモジュールでインポート',
].join('\n')

const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    chat_id: chatId,
    text,
    parse_mode: 'Markdown',
    disable_web_page_preview: false,
  }),
})

const data = await res.json().catch(() => ({}))
if (!res.ok || !data.ok) {
  console.error('telegram send failed:', res.status, JSON.stringify(data))
  process.exit(1)
}
console.log(`sent: message_id=${data.result.message_id} (${label})`)
