/**
 * 請求書のカバーメール本文を Claude で自動生成する。
 *
 * 取引先名・品目・金額・支払期限を踏まえた、丁寧な日本語ビジネスメールの
 * 「本文（署名を除く挨拶〜結び）」を返す。署名は呼び出し側(email.ts)が付与する。
 *
 * ANTHROPIC_API_KEY 未設定や API エラー時は throw する。
 * 呼び出し側で catch し、定型文にフォールバックすること(送信は常に成功させる)。
 */

import Anthropic from '@anthropic-ai/sdk'

import { getIssuerInfo, type Issuer } from './company'

export type GenerateEmailBodyInput = {
  issuer?: Issuer
  invoice: {
    invoice_number: string
    issue_date: string
    due_date: string | null
    total: number
  }
  client: {
    name: string
    contact_person?: string | null
  }
  lines?: { name: string; quantity: number; amount: number }[]
}

export async function generateInvoiceEmailBody(input: GenerateEmailBodyInput): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

  const company = getIssuerInfo(input.issuer ?? 'felicity')
  const client = new Anthropic({ apiKey })

  const lineSummary =
    input.lines && input.lines.length > 0
      ? input.lines
          .map(l => `- ${l.name}（数量 ${l.quantity}、¥${l.amount.toLocaleString('ja-JP')}）`)
          .join('\n')
      : '(明細情報なし)'

  const facts = [
    `差出人会社名: ${company.name}`,
    `宛先(取引先名): ${input.client.name}`,
    input.client.contact_person ? `宛先担当者: ${input.client.contact_person}` : null,
    `請求書番号: ${input.invoice.invoice_number}`,
    `発行日: ${input.invoice.issue_date}`,
    `お支払期限: ${input.invoice.due_date ?? '記載なし'}`,
    `ご請求金額(税込): ¥${input.invoice.total.toLocaleString('ja-JP')}`,
    `納品明細:\n${lineSummary}`,
  ]
    .filter(Boolean)
    .join('\n')

  const system =
    '日本企業間(BtoB)の請求書送付メールの本文を作成するアシスタントです。' +
    '与えられた事実のみに基づき、丁寧で簡潔なビジネス日本語のメール本文を書いてください。' +
    '制約: (1)冒頭は「<取引先名> 御中」で始める。' +
    '(2)請求書を添付した旨、請求番号・ご請求金額・お支払期限に触れる。' +
    '(3)納品内容に自然に言及してよいが、事実にない情報は決して創作しない。' +
    '(4)署名・会社名の末尾ブロックは出力しない(別途付与する)。' +
    '(5)件名は出力しない。本文テキストのみを返す。' +
    '(6)過度にへりくだらず、自然な敬語で4〜8行程度。絵文字やマークダウン記法は使わない。'

  const msg = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1024,
    system,
    messages: [
      {
        role: 'user',
        content: `以下の請求情報をもとに、請求書送付メールの本文を作成してください。\n\n${facts}`,
      },
    ],
  })

  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')
    .trim()

  if (!text) throw new Error('Claudeが空の本文を返しました')
  return text
}
