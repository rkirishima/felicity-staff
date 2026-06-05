'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type PaidVia = 'bank_transfer' | 'cash' | 'credit_card' | 'other'
export type PayableStatus = 'pending' | 'paid' | 'cancelled'

export type PayableInput = {
  vendor: string
  description: string | null
  amount: number
  invoice_number: string | null
  order_date: string | null
  due_date: string
  notes: string | null
}

export async function createPayable(input: PayableInput, createdBy: string | null): Promise<string> {
  const sb = await createClient()
  const { data, error } = await sb
    .from('keiri_payables')
    .insert({
      ...input,
      description: input.description?.trim() || null,
      invoice_number: input.invoice_number?.trim() || null,
      notes: input.notes?.trim() || null,
      created_by: createdBy,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  revalidatePath('/admin/keiri/payables')
  return data.id as string
}

export async function updatePayable(id: string, input: PayableInput): Promise<void> {
  const sb = await createClient()
  const { error } = await sb
    .from('keiri_payables')
    .update({
      ...input,
      description: input.description?.trim() || null,
      invoice_number: input.invoice_number?.trim() || null,
      notes: input.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/keiri/payables')
}

export async function deletePayable(id: string): Promise<void> {
  const sb = await createClient()
  const { error } = await sb.from('keiri_payables').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/keiri/payables')
}

export async function markPaid(
  id: string,
  opts: { paid_via: PaidVia; paid_amount?: number; bank_transaction_id?: string | null },
): Promise<void> {
  const sb = await createClient()
  const { data: cur, error: fetchErr } = await sb
    .from('keiri_payables')
    .select('amount')
    .eq('id', id)
    .single()
  if (fetchErr || !cur) throw new Error(fetchErr?.message ?? 'not found')
  const { error } = await sb
    .from('keiri_payables')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      paid_amount: opts.paid_amount ?? (cur.amount as number),
      paid_via: opts.paid_via,
      bank_transaction_id: opts.bank_transaction_id ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/keiri/payables')
}

export async function markCancelled(id: string): Promise<void> {
  const sb = await createClient()
  const { error } = await sb
    .from('keiri_payables')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/keiri/payables')
}

export async function uploadPayableInvoice(id: string, formData: FormData): Promise<string> {
  const file = formData.get('file') as File | null
  if (!file) throw new Error('ファイルがありません')
  if (file.size > 15 * 1024 * 1024) throw new Error('15MB以内にしてください')

  const sb = await createClient()
  const ext = (file.name.split('.').pop() || 'pdf').toLowerCase()
  const path = `${id}/${Date.now()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: upErr } = await sb.storage
    .from('keiri-payable-invoices')
    .upload(path, buffer, { contentType: file.type || 'application/pdf', upsert: false })
  if (upErr) throw new Error(`アップロード失敗: ${upErr.message}`)

  const { error: dbErr } = await sb
    .from('keiri_payables')
    .update({
      invoice_file_path: path,
      invoice_file_uploaded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (dbErr) throw new Error(dbErr.message)

  revalidatePath('/admin/keiri/payables')
  revalidatePath(`/admin/keiri/payables/${id}`)
  return path
}

export async function removePayableInvoice(id: string): Promise<void> {
  const sb = await createClient()
  const { data: cur } = await sb
    .from('keiri_payables')
    .select('invoice_file_path')
    .eq('id', id)
    .single()
  if (cur?.invoice_file_path) {
    await sb.storage.from('keiri-payable-invoices').remove([cur.invoice_file_path as string])
  }
  await sb
    .from('keiri_payables')
    .update({
      invoice_file_path: null,
      invoice_file_uploaded_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  revalidatePath('/admin/keiri/payables')
  revalidatePath(`/admin/keiri/payables/${id}`)
}

export async function getPayableInvoiceUrl(id: string): Promise<string | null> {
  const sb = await createClient()
  const { data } = await sb
    .from('keiri_payables')
    .select('invoice_file_path')
    .eq('id', id)
    .single()
  const path = (data?.invoice_file_path as string | null) ?? null
  if (!path) return null
  const { data: signed } = await sb.storage
    .from('keiri-payable-invoices')
    .createSignedUrl(path, 60 * 10)
  return signed?.signedUrl ?? null
}

export async function reopenPayable(id: string): Promise<void> {
  const sb = await createClient()
  const { error } = await sb
    .from('keiri_payables')
    .update({
      status: 'pending',
      paid_at: null,
      paid_amount: null,
      paid_via: null,
      bank_transaction_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/keiri/payables')
}
