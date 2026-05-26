import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/keiri/serviceClient'

export const runtime = 'nodejs'

// Public endpoint — felicity-web (and anyone) can fetch active announcements.
// Returns published rows whose [start_date, end_date] window contains today (JST).
// Sorted by priority desc then start_date desc (most prominent first).
export async function GET(): Promise<Response> {
  const todayJST = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)

  let supabase
  try {
    supabase = createServiceClient()
  } catch {
    return jsonCORS({ error: 'Supabase env not configured' }, 500)
  }

  const { data, error } = await supabase
    .from('announcements')
    .select('id, title, title_en, body, body_en, banner_text, banner_text_en, type, start_date, end_date, event_date, event_start_time, event_end_time, link_url, priority')
    .eq('published', true)
    .lte('start_date', todayJST)
    .gte('end_date', todayJST)
    .order('priority', { ascending: false })
    .order('start_date', { ascending: false })

  if (error) {
    return jsonCORS({ error: error.message }, 500)
  }

  return jsonCORS({
    count: data?.length ?? 0,
    asOf: new Date().toISOString(),
    announcements: data ?? [],
  })
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(),
  })
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=300',
  }
}

function jsonCORS(payload: unknown, status = 200): Response {
  return NextResponse.json(payload, {
    status,
    headers: corsHeaders(),
  })
}
