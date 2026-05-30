'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type SupplierRuleInput = {
  vendor: string
  email_pattern: string | null
  subject_pattern: string | null
  default_due_days: number
  notes: string | null
}

export async function createSupplierRule(input: SupplierRuleInput): Promise<void> {
  const sb = await createClient()
  const { error } = await sb.from('keiri_supplier_email_rules').insert({
    ...input,
    email_pattern: input.email_pattern?.trim() || null,
    subject_pattern: input.subject_pattern?.trim() || null,
    notes: input.notes?.trim() || null,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/admin/keiri/gmail-setup')
}

export async function updateSupplierRule(id: string, input: SupplierRuleInput): Promise<void> {
  const sb = await createClient()
  const { error } = await sb
    .from('keiri_supplier_email_rules')
    .update({
      ...input,
      email_pattern: input.email_pattern?.trim() || null,
      subject_pattern: input.subject_pattern?.trim() || null,
      notes: input.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/keiri/gmail-setup')
}

export async function deleteSupplierRule(id: string): Promise<void> {
  const sb = await createClient()
  const { error } = await sb.from('keiri_supplier_email_rules').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/keiri/gmail-setup')
}

export async function toggleAccount(id: string, active: boolean): Promise<void> {
  const sb = await createClient()
  const { error } = await sb
    .from('keiri_gmail_accounts')
    .update({ active, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/keiri/gmail-setup')
}

export async function deleteAccount(id: string): Promise<void> {
  const sb = await createClient()
  const { error } = await sb.from('keiri_gmail_accounts').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/keiri/gmail-setup')
}
