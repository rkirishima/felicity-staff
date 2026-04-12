import { NextRequest, NextResponse } from 'next/server'
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

    // 今週のスケジュールを生成（デモ用）
    const today = dayjs()
    const startOfWeek = today.startOf('week')
    
    const schedule = []
    for (let i = 0; i < 7; i++) {
      const date = startOfWeek.add(i, 'day')
      const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][date.day()]
      
      // デモ: 月〜金は9:00-18:00、土日は休み
      let status = 'off'
      let shift_start = undefined
      let shift_end = undefined

      if (date.day() !== 0 && date.day() !== 6) { // 平日
        status = 'scheduled'
        shift_start = date.hour(9).minute(0).toISOString()
        shift_end = date.hour(18).minute(0).toISOString()
      }

      schedule.push({
        date: date.format('MM/DD'),
        day: dayOfWeek,
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
