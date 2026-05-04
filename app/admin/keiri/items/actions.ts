'use server'

import { createClient } from '@/lib/supabase/server'

export type ItemInput = {
  name: string
  description: string | null
  unit_price: number
  tax_rate: 10 | 8
  unit: string | null
  category_id: string | null
}

function validate(input: ItemInput) {
  if (!input.name.trim()) throw new Error('商品名は必須です')
  if (!Number.isFinite(input.unit_price) || input.unit_price < 0) {
    throw new Error('単価は0以上の整数で入力してください')
  }
  if (input.tax_rate !== 10 && input.tax_rate !== 8) {
    throw new Error('税率は 10 か 8 のみです')
  }
}

export async function createItemRecord(input: ItemInput): Promise<{ id: string }> {
  validate(input)
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('keiri_items')
    .insert({ ...input, active: true })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return { id: data.id as string }
}

export async function updateItemRecord(id: string, input: ItemInput): Promise<void> {
  validate(input)
  const supabase = await createClient()
  const { error } = await supabase.from('keiri_items').update(input).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function archiveItem(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('keiri_items').update({ active: false }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function unarchiveItem(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('keiri_items').update({ active: true }).eq('id', id)
  if (error) throw new Error(error.message)
}
