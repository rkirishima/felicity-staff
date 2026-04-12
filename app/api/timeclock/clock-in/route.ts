import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function POST(req: NextRequest) {
  const { staff_id } = await req.json()
  if (!staff_id) return NextResponse.json({ error: 'Missing staff_id' }, { status: 400 })

  const supabase = createServiceClient()
  const now = new Date().toISOString()

  // Check if already clocked in today (no clock_out)
  const jstDate = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })
  const todayStart = new Date(`${jstDate}T00:00:00+09:00`)

  const { data: existing } = await supabase
    .from('timeclock')
    .select('id, clock_in, clock_out')
    .eq('staff_id', staff_id)
    .gte('clock_in', todayStart.toISOString())
    .is('clock_out', null)
    .single()

  if (existing) {
    return NextResponse.json({ error: 'Already clocked in' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('timeclock')
    .insert({ staff_id, clock_in: now, break_minutes: 0 })
    .select('id, staff_id, clock_in, clock_out')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
