import { createClient } from '@/lib/supabase/server'

async function nextNumber(prefix: string): Promise<string> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('next_keiri_number', { p_prefix: prefix })
  if (error) throw new Error(`採番失敗: ${error.message}`)
  if (typeof data !== 'string' || !data) throw new Error('採番失敗: 戻り値不正')
  return data
}

export function nextInvoiceNumber(): Promise<string> {
  const prefix = process.env.INVOICE_PREFIX ?? 'INV'
  return nextNumber(prefix)
}

export function nextReceiptNumber(): Promise<string> {
  const prefix = process.env.RECEIPT_PREFIX ?? 'RCP'
  return nextNumber(prefix)
}
