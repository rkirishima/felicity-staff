'use server'

import { createClient } from '@/lib/supabase/server'

export async function verifyAdminPin(pin: string): Promise<boolean> {
  return pin === process.env.ADMIN_PIN
}

export async function verifyStaffPin(staffId: string, pin: string): Promise<boolean> {
  const sb = await createClient()
  const { data } = await sb.from('staff').select('pin').eq('id', staffId).single()
  return pin === (data?.pin || '1234')
}
