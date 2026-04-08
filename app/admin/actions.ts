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
