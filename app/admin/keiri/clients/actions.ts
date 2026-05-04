'use server'

import { createClient } from '@/lib/supabase/server'

export type ClientInput = {
  name: string
  name_kana: string | null
  registration_number: string | null
  postal_code: string | null
  address: string | null
  contact_person: string | null
  email: string | null
  phone: string | null
  payment_terms: string | null
  notes: string | null
}

const REG_RE = /^T\d{13}$/

function validate(input: ClientInput) {
  if (!input.name.trim()) throw new Error('取引先名は必須です')
  if (input.registration_number && !REG_RE.test(input.registration_number)) {
    throw new Error('登録番号は T+13桁 で入力してください')
  }
}

export async function createClientRecord(input: ClientInput): Promise<{ id: string }> {
  validate(input)
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('keiri_clients')
    .insert({ ...input, active: true })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return { id: data.id as string }
}

export async function updateClientRecord(id: string, input: ClientInput): Promise<void> {
  validate(input)
  const supabase = await createClient()
  const { error } = await supabase.from('keiri_clients').update(input).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function archiveClient(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('keiri_clients').update({ active: false }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function unarchiveClient(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('keiri_clients').update({ active: true }).eq('id', id)
  if (error) throw new Error(error.message)
}
