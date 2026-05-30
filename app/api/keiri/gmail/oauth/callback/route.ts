import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/keiri/serviceClient'
import { exchangeCodeForTokens, fetchUserProfileEmail } from '@/lib/keiri/gmail'

export const runtime = 'nodejs'

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')

  if (error) {
    return NextResponse.redirect(`${url.origin}/admin/keiri/gmail-setup?error=${encodeURIComponent(error)}`)
  }
  if (!code) {
    return NextResponse.redirect(`${url.origin}/admin/keiri/gmail-setup?error=no_code`)
  }

  let tokens
  try {
    tokens = await exchangeCodeForTokens(code)
  } catch (e) {
    return NextResponse.redirect(
      `${url.origin}/admin/keiri/gmail-setup?error=${encodeURIComponent('token_exchange_failed: ' + (e instanceof Error ? e.message : String(e)))}`,
    )
  }

  let email: string
  try {
    email = await fetchUserProfileEmail(tokens.access_token)
  } catch (e) {
    return NextResponse.redirect(
      `${url.origin}/admin/keiri/gmail-setup?error=${encodeURIComponent('profile_fetch_failed: ' + (e instanceof Error ? e.message : String(e)))}`,
    )
  }

  const sb = createServiceClient()
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()
  const { error: upErr } = await sb
    .from('keiri_gmail_accounts')
    .upsert(
      {
        email,
        refresh_token: tokens.refresh_token,
        access_token: tokens.access_token,
        access_token_expires_at: expiresAt,
        active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'email' },
    )
  if (upErr) {
    return NextResponse.redirect(
      `${url.origin}/admin/keiri/gmail-setup?error=${encodeURIComponent('persist_failed: ' + upErr.message)}`,
    )
  }

  return NextResponse.redirect(
    `${url.origin}/admin/keiri/gmail-setup?connected=${encodeURIComponent(email)}`,
  )
}
