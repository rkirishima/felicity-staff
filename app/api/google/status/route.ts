import { NextResponse } from 'next/server'
import { isConnected } from '@/lib/google/calendar'

export async function GET() {
  try {
    const connected = await isConnected()
    return NextResponse.json({ connected })
  } catch {
    return NextResponse.json({ connected: false })
  }
}
