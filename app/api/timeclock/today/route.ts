import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const staff_id = searchParams.get('staff_id')
  if (!staff_id) return NextResponse.json({ error: 'Missing staff_id' }, { status: 400 })

  const supabase = createServiceClient()

  const jstDate = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })
  const todayStart = new Date(`${jstDate}T00:00:00+09:00`)

  const { data, error } = await supabase
    .from('timeclock')
    .select('id, staff_id, clock_in, clock_out, break_minutes')
    .eq('staff_id', staff_id)
    .gte('clock_in', todayStart.toISOString())
    .order('clock_in', { ascending: false })
    .limit(1)
    .single()

  if (error && error.code !== 'PGRST116') {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data || null)
}
