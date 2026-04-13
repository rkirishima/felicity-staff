import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

// GET: List all events
export async function GET() {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('events')
    .select('*, event_dates(*)')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data || [])
}

// POST: Create a new event
export async function POST(request: NextRequest) {
  const supabase = createServiceClient()

  try {
    const body = await request.json()
    const {
      title,
      title_en,
      description,
      description_en,
      event_type,
      recurrence_rule,
      floor_block,
      seats_blocked,
      max_attendees,
      time_relation,
      confirmed_date,
      dates, // array of { date, start_time, end_time }
      prep_tasks,
    } = body

    if (!title) {
      return NextResponse.json({ error: 'タイトルは必須です' }, { status: 400 })
    }

    // Insert event
    const { data: event, error: eventError } = await supabase
      .from('events')
      .insert({
        title,
        title_en: title_en || '',
        description: description || '',
        description_en: description_en || '',
        event_type: event_type || 'one_off',
        recurrence_rule: recurrence_rule || null,
        floor_block: floor_block || null,
        seats_blocked: seats_blocked || 0,
        max_attendees: max_attendees || 0,
        time_relation: time_relation || 'during',
        confirmed_date: confirmed_date || null,
        prep_tasks: prep_tasks || [],
        status: 'open',
      })
      .select()
      .single()

    if (eventError) throw eventError

    // Insert event dates if provided
    if (dates && Array.isArray(dates) && dates.length > 0) {
      const eventDates = dates.map((d: { date: string; start_time: string; end_time: string }) => ({
        event_id: event.id,
        date: d.date,
        start_time: d.start_time || null,
        end_time: d.end_time || null,
      }))

      const { error: datesError } = await supabase
        .from('event_dates')
        .insert(eventDates)

      if (datesError) throw datesError
    }

    return NextResponse.json(event, { status: 201 })
  } catch (error) {
    console.error('Create event error:', error)
    return NextResponse.json({ error: 'イベント作成に失敗しました' }, { status: 500 })
  }
}
