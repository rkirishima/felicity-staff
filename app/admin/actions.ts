'use server'

import { createClient } from '@/lib/supabase/server'
import { setAuthCookie, clearAuthCookie } from '@/lib/auth/server'

export async function verifyAdminPin(pin: string): Promise<boolean> {
  if (pin === process.env.ADMIN_PIN) {
    await setAuthCookie({ role: 'admin', sid: 'admin', name: '桐島' })
    return true
  }

  const sb = await createClient()
  const { data, error } = await sb
    .from('staff')
    .select('id, name, role')
    .in('role', ['admin', 'accountant'])
    .eq('pin', pin)
    .eq('active', true)
    .limit(1)
    .maybeSingle()
  if (error || !data) return false
  await setAuthCookie({
    role: data.role === 'accountant' ? 'accountant' : 'admin',
    sid: data.id as string,
    name: (data.name as string) ?? '',
  })
  return true
}

export async function verifyStaffPin(staffId: string, pin: string): Promise<boolean> {
  const sb = await createClient()
  const { data } = await sb.from('staff').select('pin, name').eq('id', staffId).single()
  // PIN未設定でも '1234' で通す既存挙動は残すが、実在スタッフに限る（存在しなければ拒否）
  if (!data) return false
  if (pin !== (data.pin || '1234')) return false
  await setAuthCookie({ role: 'staff', sid: staffId, name: (data.name as string) ?? '' })
  return true
}

export async function logout(): Promise<void> {
  await clearAuthCookie()
}

export async function reportAbsence(shiftId: string, staffName: string, date: string, startTime: string, endTime: string): Promise<{ ok: boolean }> {
  const sb = await createClient()
  await sb.from('shifts').update({ status: 'absent' }).eq('id', shiftId)

  const d = new Date(date + 'T12:00:00')
  const weekday = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()]
  const msg = `🚨 シフト代行募集\n\n${staffName}さんが ${d.getMonth() + 1}/${d.getDate()}(${weekday}) ${startTime.slice(0, 5)}〜${endTime.slice(0, 5)} に入れません。\n\nカバーできる方はアプリから申請を👇\nhttps://felicity-staff.vercel.app/schedule`

  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      to: process.env.LINE_STAFF_GROUP_ID,
      messages: [{ type: 'text', text: msg }],
    }),
  })

  return { ok: true }
}
