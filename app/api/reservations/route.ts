import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(request: NextRequest) {
  const supabase = createServiceClient()
  const url = new URL(request.url)
  const dateParam = url.searchParams.get('date')

  // Default to today (JST)
  const now = new Date()
  const jstOffset = 9 * 60 * 60 * 1000
  const jstDate = new Date(now.getTime() + jstOffset)
  const today = dateParam || jstDate.toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('reservations')
    .select('*')
    .eq('date', today)
    .order('time', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data || [])
}
