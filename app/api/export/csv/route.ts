import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'

dayjs.extend(utc)
dayjs.extend(timezone)

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type') || 'timeclock'
    const dateFrom = searchParams.get('date_from')
    const dateTo = searchParams.get('date_to')

    if (!['timeclock', 'schedule'].includes(type)) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
    }

    const supabase = createServiceClient()

    let csv = ''

    if (type === 'timeclock') {
      let query = supabase
        .from('timeclock')
        .select('id, clock_in, clock_out, break_minutes, note, staff(name)')
        .order('clock_in', { ascending: true })

      if (dateFrom) {
        query = query.gte('clock_in', new Date(`${dateFrom}T00:00:00+09:00`).toISOString())
      }
      if (dateTo) {
        query = query.lte('clock_in', new Date(`${dateTo}T23:59:59+09:00`).toISOString())
      }

      const { data, error } = await query
      if (error) throw error

      const headers = ['スタッフ名', '日付', '出勤時刻', '退勤時刻', '休憩(分)', 'メモ']
      const rows = (data || []).map((r: any) => [
        r.staff?.name ?? '',
        r.clock_in ? dayjs(r.clock_in).tz('Asia/Tokyo').format('YYYY-MM-DD') : '',
        r.clock_in ? dayjs(r.clock_in).tz('Asia/Tokyo').format('HH:mm') : '',
        r.clock_out ? dayjs(r.clock_out).tz('Asia/Tokyo').format('HH:mm') : '',
        r.break_minutes ?? 0,
        r.note ?? '',
      ])
      csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n')
    } else {
      let query = supabase
        .from('schedule_requests')
        .select('*')
        .order('requested_date', { ascending: true })

      if (dateFrom) query = query.gte('requested_date', dateFrom)
      if (dateTo)   query = query.lte('requested_date', dateTo)

      const { data, error } = await query
      if (error) throw error

      const headers = ['スタッフ名', '申請日', '開始時刻', '終了時刻', 'ステータス', '理由']
      const rows = (data || []).map((r: any) => [
        r.staff_name ?? '',
        r.requested_date ?? '',
        r.start_time ?? '',
        r.end_time ?? '',
        r.status ?? '',
        r.reason ?? '',
      ])
      csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n')
    }

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${type}_${dayjs().tz('Asia/Tokyo').format('YYYYMMDD_HHmmss')}.csv"`,
      },
    })
  } catch (error) {
    console.error('CSV export error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
