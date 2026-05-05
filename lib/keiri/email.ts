import { Resend } from 'resend'
import { getCompanyInfo } from './company'

export type InvoiceForEmail = {
  invoice_number: string
  issue_date: string
  due_date: string | null
  total: number
}

export type ClientForEmail = {
  name: string
  email: string | null
}

export type SendInvoiceEmailInput = {
  invoice: InvoiceForEmail
  client: ClientForEmail
  pdfBuffer: Buffer
  to?: string
  subject?: string
  body?: string
}

export async function sendInvoiceEmail(input: SendInvoiceEmailInput): Promise<{ id: string | null }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('RESEND_API_KEY not set')

  const company = getCompanyInfo()
  const to = input.to ?? input.client.email
  if (!to) throw new Error('送信先メールアドレスが指定されていません')

  const subject = input.subject ?? `【${company.name}】請求書 ${input.invoice.invoice_number} のご送付`
  const body =
    input.body ??
    `${input.client.name} 御中

平素より大変お世話になっております。
${company.name}でございます。

請求書（No. ${input.invoice.invoice_number}）をお送りいたします。
お支払期限: ${input.invoice.due_date ?? '—'}
ご請求金額: ¥${input.invoice.total.toLocaleString()}（税込）

ご確認のほど、よろしくお願いいたします。

──────────
${company.name}
${company.postal} ${company.address}
${company.email}
登録番号: ${company.registrationNumber}
`

  const resend = new Resend(apiKey)
  const fromAddress = company.email || 'info@felicity.cafe'
  const fromName = company.name || 'FELICITY'
  const from = `${fromName} <${fromAddress}>`

  const result = await resend.emails.send({
    from,
    to,
    subject,
    text: body,
    attachments: [
      {
        filename: `invoice-${input.invoice.invoice_number}.pdf`,
        content: input.pdfBuffer,
      },
    ],
  })

  if (result.error) throw new Error(`メール送信失敗: ${result.error.message}`)
  return { id: result.data?.id ?? null }
}
