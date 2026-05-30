import { NextResponse } from 'next/server'
import { buildAuthorizeUrl } from '@/lib/keiri/gmail'

export const runtime = 'nodejs'

// /api/keiri/gmail/oauth/start?label=rkirishima
// Returns a redirect to Google's consent page. After user grants access,
// Google redirects back to /api/keiri/gmail/oauth/callback?code=...&state=label
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const label = url.searchParams.get('label') || 'default'
  let authUrl: string
  try {
    authUrl = buildAuthorizeUrl(label)
  } catch (e) {
    return NextResponse.json(
      { error: 'oauth not configured', detail: e instanceof Error ? e.message : String(e) },
      { status: 503 },
    )
  }
  return NextResponse.redirect(authUrl)
}
