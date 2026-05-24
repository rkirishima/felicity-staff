/**
 * Resend で請求書PDFをメール送信。
 */

import { Resend } from 'resend'

import type { MonthlyInvoiceData } from './types'

function client() {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('RESEND_API_KEY not set')
  return new Resend(key)
}

const FROM = 'FCR <invoice@felicity.cafe>' // SPF/DKIM 設定要

export async function sendInvoiceEmail(opts: {
  to: string
  data: MonthlyInvoiceData
  invoiceNumber: string
  pdfBytes: Buffer
}): Promise<{ id: string }> {
  const resend = client()

  const ym = `${opts.data.year}年${opts.data.month}月`
  const total = `¥${opts.data.total.toLocaleString('ja-JP')}`

  const text = [
    `株式会社FELICITY 御中`,
    ``,
    `${ym}分のご請求書をお送りいたします。`,
    ``,
    `請求番号: ${opts.invoiceNumber}`,
    `ご請求金額: ${total} (税込)`,
    ``,
    `内訳は添付PDFをご確認ください。`,
    ``,
    `--`,
    `FELICITY COFFEE ROASTERS`,
    `〒240-0115 神奈川県三浦郡葉山町上山口2432-3`,
    `TEL: 090-8879-1313`,
  ].join('\n')

  const filename = `${opts.data.year}-${String(opts.data.month).padStart(2, '0')}_FCR-FELICITY.pdf`

  const { data, error } = await resend.emails.send({
    from: FROM,
    to: opts.to,
    subject: `【FCR】${ym}分 請求書 (${opts.invoiceNumber})`,
    text,
    attachments: [{ filename, content: opts.pdfBytes }],
  })
  if (error) throw new Error(`Resend failed: ${error.message ?? JSON.stringify(error)}`)
  return { id: data?.id ?? 'unknown' }
}
