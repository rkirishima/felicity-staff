'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth/server'
import { createAdminClient } from '@/lib/supabase/admin'

// 業販の銀行振込注文に入金確認を付ける。これで取引先の注文履歴に領収書が出る
// （felicity-web の /wholesale/orders は status='paid' の注文にだけ領収書を出す）。
//
// wholesale_orders は RLS で anon から読めないので、読み書きはサーバーで行う。
export async function markWholesaleOrderPaid(
  orderId: string,
  paidDate: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession()
  if (!session || (session.role !== 'admin' && session.role !== 'accountant')) {
    return { ok: false, error: '権限がありません' }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidDate)) return { ok: false, error: '入金日を入力してください' }

  // 入金日は JST の日付。領収書の発行日にそのまま使われる。
  const paidAt = new Date(`${paidDate}T12:00:00+09:00`).toISOString()

  const sb = createAdminClient()
  const { data, error } = await sb
    .from('wholesale_orders')
    .update({ status: 'paid', paid_at: paidAt })
    .eq('id', orderId)
    .eq('status', 'pending_bank_transfer')
    .select('id')
  if (error) return { ok: false, error: error.message }
  if (!data || data.length === 0) return { ok: false, error: '入金待ちの注文ではありません' }

  revalidatePath('/admin/keiri/wholesale')
  return { ok: true }
}
