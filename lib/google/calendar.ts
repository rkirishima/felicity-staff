import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'https://staff.felicity.cafe/api/google/callback'

export function getAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar.events',
    access_type: 'offline',
    prompt: 'consent',
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

export async function exchangeCode(code: string): Promise<{ access_token: string; refresh_token: string }> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error('OAuth failed: ' + JSON.stringify(data))

  // Store refresh token
  if (data.refresh_token) {
    await sb.from('app_settings').upsert({
      key: 'google_refresh_token',
      value: data.refresh_token,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' })
  }

  return data
}

async function getAccessToken(): Promise<string> {
  const { data } = await sb.from('app_settings').select('value').eq('key', 'google_refresh_token').single()
  if (!data?.value) throw new Error('Google Calendar not connected')

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: data.value,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  })
  const tokens = await res.json()
  if (!tokens.access_token) throw new Error('Token refresh failed')
  return tokens.access_token
}

export async function createCalendarEvent(params: {
  summary: string
  description?: string
  date: string
  startTime?: string
  endTime?: string
  location?: string
}): Promise<{ id: string; htmlLink: string }> {
  const token = await getAccessToken()

  const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary'

  const event: any = {
    summary: params.summary,
    description: params.description,
    location: params.location || 'Felicity Cafe',
  }

  if (params.startTime && params.endTime) {
    event.start = { dateTime: `${params.date}T${params.startTime}:00`, timeZone: 'Asia/Tokyo' }
    event.end = { dateTime: `${params.date}T${params.endTime}:00`, timeZone: 'Asia/Tokyo' }
  } else {
    event.start = { date: params.date }
    event.end = { date: params.date }
  }

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    }
  )

  const data = await res.json()
  if (!res.ok) throw new Error('Calendar API error: ' + JSON.stringify(data))
  return { id: data.id, htmlLink: data.htmlLink }
}

export async function isConnected(): Promise<boolean> {
  const { data } = await sb.from('app_settings').select('value').eq('key', 'google_refresh_token').single()
  return !!data?.value
}
