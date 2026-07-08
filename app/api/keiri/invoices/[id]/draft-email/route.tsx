/**
 * 請求書カバーメール本文のAI下書きを返す(GET)。
 * 送信モーダルの「AI下書きを生成」ボタンから呼ばれ、本文テキストエリアに流し込む。
 * 生成本文＋署名を返すので、ユーザーが確認・編集してそのまま送信できる。
 */

import { createServiceClient } from '@/lib/keiri/serviceClient'
import { getIssuerInfo, normalizeIssuer } from '@/lib/keiri/company'
import { generateInvoiceEmailBody } from '@/lib/keiri/generateEmailBody'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ ok: false, error: 'ANTHROPIC_API_KEY not set' }, { status: 503 })
  }

  const supabase = createServiceClient()

  const { data: inv, error } = await supabase
    .from('keiri_invoices')
    .select(
      'invoice_number, issuer, issue_date, due_date, total, client:keiri_clients(name, contact_person)',
    )
    .eq('id', id)
    .single()
  if (error || !inv) return Response.json({ ok: false, error: 'invoice not found' }, { status: 404 })
  if (!inv.invoice_number) {
    return Response.json({ ok: false, error: '下書きは送信できません' }, { status: 400 })
  }

  const { data: lineRows } = await supabase
    .from('keiri_invoice_lines')
    .select('description, quantity, amount, sort_order')
    .eq('invoice_id', id)
    .order('sort_order')

  const client =
    (inv.client as unknown as { name: string; contact_person: string | null } | null) ?? null

  const issuer = normalizeIssuer(inv.issuer)

  try {
    const message = await generateInvoiceEmailBody({
      issuer,
      invoice: {
        invoice_number: inv.invoice_number as string,
        issue_date: inv.issue_date as string,
        due_date: (inv.due_date as string | null) ?? null,
        total: inv.total as number,
      },
      client: { name: client?.name ?? '', contact_person: client?.contact_person ?? null },
      lines: (lineRows ?? []).map(l => ({
        name: l.description as string,
        quantity: l.quantity as number,
        amount: l.amount as number,
      })),
    })

    const company = getIssuerInfo(issuer)
    const signature = `──────────
${company.name}
${company.postal} ${company.address}
${company.email}
登録番号: ${company.registrationNumber}`

    return Response.json({ ok: true, body: `${message}\n\n${signature}` })
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
