'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type Category = 'ingredients' | 'goods' | 'supplies'

export type InventoryInput = {
  snapshot_date: string
  item_name: string
  category: Category
  unit_price: number
  quantity: number
  unit: string | null
  note: string | null
}

export async function createInventoryItem(input: InventoryInput, createdBy: string | null): Promise<string> {
  const sb = await createClient()
  const { data, error } = await sb
    .from('keiri_inventory_snapshots')
    .insert({
      ...input,
      unit: input.unit?.trim() || null,
      note: input.note?.trim() || null,
      created_by: createdBy,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  revalidatePath('/admin/keiri/inventory')
  return data.id as string
}

export async function updateInventoryItem(id: string, input: InventoryInput): Promise<void> {
  const sb = await createClient()
  const { error } = await sb
    .from('keiri_inventory_snapshots')
    .update({
      ...input,
      unit: input.unit?.trim() || null,
      note: input.note?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/keiri/inventory')
}

export async function deleteInventoryItem(id: string): Promise<void> {
  const sb = await createClient()
  const { error } = await sb.from('keiri_inventory_snapshots').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/keiri/inventory')
}

// 前月分を当月にコピー（数量だけ後で調整する想定）
export async function copyFromPreviousMonth(
  targetDate: string,
  sourceDate: string,
  createdBy: string | null,
): Promise<{ inserted: number; skipped: number }> {
  const sb = await createClient()
  const { data: source, error: selErr } = await sb
    .from('keiri_inventory_snapshots')
    .select('item_name, category, unit_price, quantity, unit, note')
    .eq('snapshot_date', sourceDate)
  if (selErr) throw new Error(selErr.message)
  if (!source || source.length === 0) {
    return { inserted: 0, skipped: 0 }
  }
  const { data: existing } = await sb
    .from('keiri_inventory_snapshots')
    .select('item_name, category')
    .eq('snapshot_date', targetDate)
  const existingKeys = new Set(
    (existing ?? []).map(r => `${r.item_name as string}::${r.category as string}`),
  )

  const toInsert = source
    .filter(r => !existingKeys.has(`${r.item_name as string}::${r.category as string}`))
    .map(r => ({
      snapshot_date: targetDate,
      item_name: r.item_name as string,
      category: r.category as Category,
      unit_price: r.unit_price as number,
      quantity: r.quantity as number,
      unit: r.unit as string | null,
      note: r.note as string | null,
      created_by: createdBy,
    }))

  if (toInsert.length === 0) {
    return { inserted: 0, skipped: source.length }
  }
  const { error: insErr } = await sb.from('keiri_inventory_snapshots').insert(toInsert)
  if (insErr) throw new Error(insErr.message)
  revalidatePath('/admin/keiri/inventory')
  return { inserted: toInsert.length, skipped: source.length - toInsert.length }
}
