import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET() {
  const supabase = createServiceClient()

  const { data: floors } = await supabase
    .from('floor_capacity')
    .select('*')
    .order('floor')

  const { data: sections } = await supabase
    .from('floor_sections')
    .select('*')
    .eq('active', true)
    .order('sort_order')

  return NextResponse.json({
    floors: floors || [],
    sections: sections || [],
  })
}
