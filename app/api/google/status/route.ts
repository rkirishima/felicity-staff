import { NextResponse } from 'next/server'
import { isConnected } from '@/lib/google/calendar'
import { requireAdmin } from '@/lib/auth/server'

export async function GET() {
  const denied = await requireAdmin(); if (denied) return denied
  try {
    const connected = await isConnected()
    return NextResponse.json({ connected })
  } catch {
    return NextResponse.json({ connected: false })
  }
}
