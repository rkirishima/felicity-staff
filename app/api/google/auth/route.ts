import { NextResponse } from 'next/server'
import { getAuthUrl } from '@/lib/google/calendar'

export async function GET() {
  try {
    const url = getAuthUrl()
    return NextResponse.redirect(url)
  } catch (error) {
    console.error('Google auth error:', error)
    return NextResponse.json({ error: 'Failed to initiate Google auth' }, { status: 500 })
  }
}
