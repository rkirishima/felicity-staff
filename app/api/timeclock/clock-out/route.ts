import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function POST(req: NextRequest) {
  const { staff_id } = await req.json()
  if (!staff_id) return NextResponse.json({ error: 'Missing staff_id' }, { status: 400 })

  const supabase = createServiceClient()

  const jstDate = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })
  const todayStart = new Date(`${jstDate}T00:00:00+09:00`)

  const { data: record } = await supabase
    .from('timeclock')
    .select('id')
    .eq('staff_id', staff_id)
    .gte('clock_in', todayStart.toISOString())
    .is('clock_out', null)
    .single()

  if (!record) return NextResponse.json({ error: 'No active clock-in found' }, { status: 400 })

  const { data, error } = await supabase
    .from('timeclock')
    .update({ clock_out: new Date().toISOString() })
    .eq('id', record.id)
    .select('id, staff_id, clock_in, clock_out')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
