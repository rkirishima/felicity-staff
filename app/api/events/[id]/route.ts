import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

// PATCH: Update an event
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServiceClient()

  try {
    const body = await request.json()

    const { data, error } = await supabase
      .from('events')
      .update(body)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(data)
  } catch (error) {
    console.error('Update event error:', error)
    return NextResponse.json({ error: 'イベント更新に失敗しました' }, { status: 500 })
  }
}

// DELETE: Delete an event
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServiceClient()

  try {
    // Delete related event_dates first
    await supabase.from('event_dates').delete().eq('event_id', id)
    await supabase.from('event_votes').delete().eq('event_id', id)
    await supabase.from('event_instances').delete().eq('event_id', id)

    const { error } = await supabase
      .from('events')
      .delete()
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete event error:', error)
    return NextResponse.json({ error: 'イベント削除に失敗しました' }, { status: 500 })
  }
}
