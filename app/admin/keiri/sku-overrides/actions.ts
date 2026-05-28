'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { RevenueCategory } from '@/lib/keiri/classifyRevenue'

export async function setOverride(
  itemName: string,
  revenueCategory: RevenueCategory | null,
  note?: string,
): Promise<void> {
  const sb = await createClient()
  if (revenueCategory === null) {
    const { error } = await sb
      .from('keiri_square_item_overrides')
      .delete()
      .eq('item_name', itemName)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await sb
      .from('keiri_square_item_overrides')
      .upsert(
        {
          item_name: itemName,
          revenue_category: revenueCategory,
          note: note ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'item_name' },
      )
    if (error) throw new Error(error.message)
  }
  revalidatePath('/admin/keiri/sku-overrides')
  revalidatePath('/admin/keiri/square')
  revalidatePath('/admin/keiri/tax-report')
}
