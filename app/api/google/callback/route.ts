import { NextRequest, NextResponse } from 'next/server'
import { getOAuth2Client } from '@/lib/google/calendar'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const code = url.searchParams.get('code')

    if (!code) {
      return NextResponse.json({ error: 'Missing authorization code' }, { status: 400 })
    }

    const oauth2Client = getOAuth2Client()
    const { tokens } = await oauth2Client.getToken(code)

    if (!tokens.refresh_token) {
      return NextResponse.json({ error: 'No refresh token received. Please revoke access and try again.' }, { status: 400 })
    }

    // Store refresh token in Supabase
    const supabase = createServiceClient()

    await supabase
      .from('app_settings')
      .upsert({
        key: 'google_refresh_token',
        value: tokens.refresh_token,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' })

    // Redirect to admin page with success message
    const baseUrl = url.origin
    return NextResponse.redirect(`${baseUrl}/admin?gcal=connected`)
  } catch (error) {
    console.error('Google callback error:', error)
    return NextResponse.json({ error: 'Failed to complete Google auth' }, { status: 500 })
  }
}
