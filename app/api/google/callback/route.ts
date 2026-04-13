import { NextRequest, NextResponse } from 'next/server'
import { exchangeCode } from '@/lib/google/calendar'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  if (!code) {
    return NextResponse.json({ error: 'No code provided' }, { status: 400 })
  }

  try {
    await exchangeCode(code)
    // Redirect back to admin with success
    const baseUrl = req.nextUrl.origin
    return NextResponse.redirect(`${baseUrl}/admin?gcal=connected`)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
