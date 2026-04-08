import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json(
    { version: process.env.APP_VERSION ?? '1.6' },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
