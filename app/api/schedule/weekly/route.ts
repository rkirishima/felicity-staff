import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import dayjs from 'dayjs'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const user_id = searchParams.get('user_id')

    if (!user_id) {
      return NextResponse.json(
        { error: 'Missing user_id' },
        { status: 400 }
      )
    }

    const supabase = createServiceClient()

    const today = dayjs()
    const startOfWeek = today.startOf('week') // Sunday
    const endOfWeek = startOfWeek.add(6, 'day')

    const startDate = startOfWeek.format('YYYY-MM-DD')
    const endDate = endOfWeek.format('YYYY-MM-DD')

    // Fetch shifts for this user in this week
    const { data: shifts } = await supabase
      .from('shifts')
      .select('*')
      .eq('staff_id', user_id)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true })

    const dayNames = ['日', '月', '火', '水', '木', '金', '土']
    const schedule = []

    for (let i = 0; i < 7; i++) {
      const date = startOfWeek.add(i, 'day')
      const dateStr = date.format('YYYY-MM-DD')
      const shift = shifts?.find(s => s.date === dateStr)

      let status: 'scheduled' | 'off' | 'pending' = 'off'
      let shift_start: string | undefined
      let shift_end: string | undefined

      if (shift) {
        status = shift.status === 'approved' ? 'scheduled' : shift.status === 'pending' ? 'pending' : 'off'
        if (shift.start_time) {
          shift_start = `${dateStr}T${shift.start_time}`
        }
        if (shift.end_time) {
          shift_end = `${dateStr}T${shift.end_time}`
        }
      }

      schedule.push({
        date: date.format('MM/DD'),
        day: dayNames[date.day()],
        shift_start,
        shift_end,
        status,
      })
    }

    return NextResponse.json(schedule)
  } catch (error) {
    console.error('Weekly schedule error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
