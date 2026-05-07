'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function markOrderPaid(orderId: string): Promise<void> {
  const sb = await createClient()
  const { error } = await sb
    .from('orders')
    .update({ status: 'paid' })
    .eq('id', orderId)
    .eq('status', 'pending_bank_transfer')
  if (error) throw new Error(error.message)
  revalidatePath('/admin/keiri/pending-payments')
  revalidatePath('/admin/keiri')
  revalidatePath('/admin/sales')
}
