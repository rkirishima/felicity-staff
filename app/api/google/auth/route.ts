import { NextResponse } from 'next/server'
import { getAuthUrl } from '@/lib/google/calendar'
import { requireAdmin } from '@/lib/auth/server'

export async function GET() {
  const denied = await requireAdmin(); if (denied) return denied
  const url = getAuthUrl()
  return NextResponse.redirect(url)
}
