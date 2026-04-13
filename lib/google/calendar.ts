import { google } from 'googleapis'

const SCOPES = ['https://www.googleapis.com/auth/calendar.events']

export function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI // e.g. https://yourapp.vercel.app/api/google/callback
  )
}

export function getAuthUrl() {
  const oauth2Client = getOAuth2Client()
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  })
}

export async function getAuthedClient() {
  const oauth2Client = getOAuth2Client()

  // Get stored refresh token from Supabase
  const { createServiceClient } = await import('@/lib/supabase/service')
  const supabase = createServiceClient()

  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'google_refresh_token')
    .single()

  if (!data?.value) {
    throw new Error('Google Calendar not connected')
  }

  oauth2Client.setCredentials({
    refresh_token: data.value,
  })

  return oauth2Client
}

interface CalendarEventParams {
  summary: string
  description?: string
  startTime: string // ISO 8601 or 'YYYY-MM-DDTHH:mm:ss'
  endTime: string
  location?: string
}

export async function createCalendarEvent(params: CalendarEventParams) {
  const auth = await getAuthedClient()
  const calendar = google.calendar({ version: 'v3', auth })

  const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary'

  const event = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary: params.summary,
      description: params.description,
      location: params.location,
      start: {
        dateTime: params.startTime,
        timeZone: 'Asia/Tokyo',
      },
      end: {
        dateTime: params.endTime,
        timeZone: 'Asia/Tokyo',
      },
    },
  })

  return event.data
}
