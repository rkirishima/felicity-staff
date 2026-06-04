/**
 * 毎月1日 09:00 JST(=前日24:00 UTC) に走るcron。
 * 前月分の焙煎ログを集計して keiri_invoices にドラフトを作成、
 * Telegramでレビューリンクを送付。
 *
 * 手動実行(GET) も可: ?year=2026&month=5
 */

import { NextRequest, NextResponse } from 'next/server'

import { buildAndPersistInvoice } from '@/lib/roast-invoice/build'
import { sendTelegramMessage } from '@/lib/telegram'

export const runtime = 'nodejs'
export const maxDuration = 60 // PDF生成 + storage uploadに余裕

function previousMonth(now: Date): { year: number; month: number } {
  // JSTの前月を計算
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const y = jst.getUTCFullYear()
  const m = jst.getUTCMonth() + 1 // 1-indexed
  const py = m === 1 ? y - 1 : y
  const pm = m === 1 ? 12 : m - 1
  return { year: py, month: pm }
}

function authorize(req: NextRequest): boolean {
  // Vercel Cronは Authorization: Bearer <CRON_SECRET> をつける
  const auth = req.headers.get('authorization')
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  return auth === `Bearer ${expected}`
}

export async function GET(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const overrideYear = url.searchParams.get('year')
  const overrideMonth = url.searchParams.get('month')

  const target =
    overrideYear && overrideMonth
      ? { year: Number(overrideYear), month: Number(overrideMonth) }
      : previousMonth(new Date())

  try {
    const result = await buildAndPersistInvoice(target)

    const ym = `${target.year}年${target.month}月`

    // 既存(手動/確定済み)を保護してスキップした場合は通知だけ送る
    if (result.skipped) {
      const skipText = [
        `⚠️ <b>${ym} 自動請求をスキップ</b>`,
        ``,
        `${result.invoiceNumber} は既存のため上書きしませんでした。`,
        `理由: ${result.skipReason}`,
        ``,
        `繰越などの手動ドラフトがある場合は月末に確定してください。`,
      ].join('\n')
      const skipTg = await sendTelegramMessage({ text: skipText, parseMode: 'HTML' })
      return NextResponse.json({
        ok: true,
        skipped: true,
        target,
        invoiceNumber: result.invoiceNumber,
        telegram: skipTg,
      })
    }

    // Telegramでドラフトレビュー通知
    const reviewBase = process.env.PUBLIC_APP_URL ?? 'https://felicity-staff.vercel.app'
    const reviewUrl = `${reviewBase}/admin/invoice-review/${result.invoiceId}`
    const text = [
      `🧾 <b>${ym} 請求書ドラフト</b>`,
      ``,
      `番号: ${result.invoiceNumber}`,
      `合計: ¥${result.data.total.toLocaleString('ja-JP')} (税込)`,
      `品目: ${result.data.items.length}豆 + 焙煎代`,
      ``,
      `<a href="${reviewUrl}">レビューして送付</a>`,
    ].join('\n')
    const tg = await sendTelegramMessage({ text, parseMode: 'HTML' })

    return NextResponse.json({
      ok: true,
      target,
      invoice: {
        id: result.invoiceId,
        number: result.invoiceNumber,
        pdfPath: result.pdfPath,
        total: result.data.total,
        items: result.data.items.length,
      },
      telegram: tg,
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, target, error: (e as Error).message, stack: (e as Error).stack },
      { status: 500 },
    )
  }
}
