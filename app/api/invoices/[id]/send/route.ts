/**
 * ドラフト請求書を送付。
 *   - keiri_invoices からデータ取得
 *   - Storage から PDF DL
 *   - Resend で送付
 *   - status='sent', sent_at=now
 *   - Telegram通知
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { sendInvoiceEmail } from '@/lib/roast-invoice/email'
import { downloadInvoiceBytes } from '@/lib/roast-invoice/storage'
import { sendTelegramMessage } from '@/lib/telegram'
import type { MonthlyInvoiceData } from '@/lib/roast-invoice/types'

export const runtime = 'nodejs'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = admin()

  const { data: inv, error } = await supabase
    .from('keiri_invoices')
    .select('*, keiri_clients(name, email)')
    .eq('id', id)
    .single()

  if (error || !inv) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (inv.status !== 'draft') return NextResponse.json({ error: 'already sent or void' }, { status: 400 })
  if (!inv.pdf_path) return NextResponse.json({ error: 'no PDF' }, { status: 400 })
  const to = (inv.keiri_clients as { email?: string } | null)?.email
  if (!to) return NextResponse.json({ error: 'recipient email missing' }, { status: 400 })

  // 明細(集計用)
  const { data: linesRaw } = await supabase
    .from('keiri_invoice_lines')
    .select('description, quantity, unit_price, amount, sort_order')
    .eq('invoice_id', id)
    .order('sort_order', { ascending: true })
  const lines = linesRaw ?? []

  // MonthlyInvoiceDataもどき(emailテキスト生成に必要なフィールドだけ)
  // invoice_number が null / FCR形式外だと .match が例外や NaN年NaN月 を生むためガード
  const numMatch =
    typeof inv.invoice_number === 'string'
      ? inv.invoice_number.match(/^FCR-(\d{4})-(\d{2})$/)
      : null
  if (!numMatch) {
    return NextResponse.json(
      { error: `invalid invoice_number for roast send: ${inv.invoice_number ?? 'null'}` },
      { status: 400 },
    )
  }
  const [, ystr, mstr] = numMatch
  const data: MonthlyInvoiceData = {
    year: Number(ystr),
    month: Number(mstr),
    items: lines
      .filter((l) => !String(l.description).startsWith('焙煎代'))
      .map((l) => ({
        product: l.description,
        bean_id: '',
        batches: 0,
        kg: Number(l.quantity),
        green_unit_price: l.unit_price,
        green_amount: l.amount,
        roast_amount: 0,
      })),
    bean_subtotal: 0,
    roast_subtotal: 0,
    subtotal: inv.subtotal_8 ?? 0,
    tax: inv.tax_8 ?? 0,
    total: inv.total,
  }

  // PDF取得
  let pdfBytes: Buffer
  try {
    const u8 = await downloadInvoiceBytes(inv.pdf_path)
    pdfBytes = Buffer.from(u8)
  } catch (e) {
    return NextResponse.json({ error: `pdf download: ${(e as Error).message}` }, { status: 500 })
  }

  // 送付
  let resendId: string
  try {
    const res = await sendInvoiceEmail({
      to,
      data,
      invoiceNumber: inv.invoice_number,
      pdfBytes,
    })
    resendId = res.id
  } catch (e) {
    return NextResponse.json({ error: `resend: ${(e as Error).message}` }, { status: 500 })
  }

  // ステータス更新
  await supabase
    .from('keiri_invoices')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', id)

  // Telegram通知
  await sendTelegramMessage({
    text: [
      `✅ <b>${data.year}年${data.month}月 請求書 送付完了</b>`,
      ``,
      `番号: ${inv.invoice_number}`,
      `宛先: ${to}`,
      `金額: ¥${inv.total.toLocaleString('ja-JP')} (税込)`,
      `Resend ID: ${resendId}`,
    ].join('\n'),
    parseMode: 'HTML',
  })

  return NextResponse.json({ ok: true, resendId })
}
