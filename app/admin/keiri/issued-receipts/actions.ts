'use server'

import { createClient } from '@/lib/supabase/server'
import { nextReceiptNumber } from '@/lib/keiri/numbering'
import { backCalcTax, type TaxRate } from '@/lib/keiri/tax'

export type IssuedReceiptInput = {
  client_name: string
  issue_date: string
  amount: number
  tax_rate: TaxRate
  purpose: string | null
  payment_method: string | null
}

function validate(input: IssuedReceiptInput) {
  if (!input.client_name.trim()) throw new Error('宛名は必須です')
  if (!input.issue_date) throw new Error('発行日を入力してください')
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error('金額は正の整数です')
  if (input.tax_rate !== 10 && input.tax_rate !== 8) throw new Error('税率は 10 か 8 のみです')
}

export async function createIssuedReceipt(
  input: IssuedReceiptInput,
): Promise<{ id: string; receipt_number: string }> {
  validate(input)
  const supabase = await createClient()
  const receipt_number = await nextReceiptNumber()
  const { exclTax, tax } = backCalcTax(input.amount, input.tax_rate)

  const { data, error } = await supabase
    .from('keiri_receipts_issued')
    .insert({
      receipt_number,
      client_name: input.client_name.trim(),
      issue_date: input.issue_date,
      amount: Math.trunc(input.amount),
      tax_rate: input.tax_rate,
      excl_tax: exclTax,
      tax,
      purpose: input.purpose,
      payment_method: input.payment_method,
      status: 'issued',
    })
    .select('id, receipt_number')
    .single()
  if (error) throw new Error(error.message)
  return { id: data.id as string, receipt_number: data.receipt_number as string }
}

export async function cancelIssuedReceipt(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('keiri_receipts_issued')
    .update({ status: 'cancelled' })
    .eq('id', id)
  if (error) throw new Error(error.message)
}
