import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

// GET /api/timeclock/records?date=2026-04-11
// Returns all timeclock records for a date with staff names
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') || new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })

  const supabase = createServiceClient()

  const dayStart = new Date(`${date}T00:00:00+09:00`).toISOString()
  const dayEnd   = new Date(`${date}T23:59:59+09:00`).toISOString()

  const { data, error } = await supabase
    .from('timeclock')
    .select('id, staff_id, clock_in, clock_out, break_minutes, note, staff(name)')
    .gte('clock_in', dayStart)
    .lte('clock_in', dayEnd)
    .order('clock_in', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

// PATCH /api/timeclock/records
// Body: { id, clock_in?, clock_out?, break_minutes?, note? }
export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { id, clock_in, clock_out, break_minutes, note } = body

  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const supabase = createServiceClient()

  const updates: Record<string, unknown> = {}
  if (clock_in !== undefined)      updates.clock_in = clock_in
  if (clock_out !== undefined)     updates.clock_out = clock_out
  if (break_minutes !== undefined) updates.break_minutes = break_minutes
  if (note !== undefined)          updates.note = note

  const { data, error } = await supabase
    .from('timeclock')
    .update(updates)
    .eq('id', id)
    .select('id, staff_id, clock_in, clock_out, break_minutes, note, staff(name)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/timeclock/records?id=xxx
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const supabase = createServiceClient()
  const { error } = await supabase.from('timeclock').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
