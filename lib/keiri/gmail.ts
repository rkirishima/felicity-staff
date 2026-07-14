// Gmail API helper for OAuth + message fetch.
// We use refresh_token stored per-account; access_token is rotated on demand.

import { createServiceClient } from './serviceClient'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1'

export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  // 請求書_受け箱 フォルダの自動取込 (drive-invoice-poll) 用
  'https://www.googleapis.com/auth/drive.readonly',
].join(' ')

export type GmailAccount = {
  id: string
  email: string
  refresh_token: string
  access_token: string | null
  access_token_expires_at: string | null
  last_polled_at: string | null
  last_message_internal_date: number | null
  active: boolean
}

export type GmailMessage = {
  id: string
  threadId: string
  internalDate: string // ms since epoch as string
  subject: string
  from: string
  to: string
  date: string
  snippet: string
  bodyText: string
  bodyHtml: string | null
}

export function gmailClientCreds(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set in env')
  }
  return { clientId, clientSecret }
}

export function gmailRedirectUri(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://staff.felicity.cafe'
  return `${base}/api/keiri/gmail/oauth/callback`
}

export function buildAuthorizeUrl(state: string): string {
  const { clientId } = gmailClientCreds()
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  u.searchParams.set('client_id', clientId)
  u.searchParams.set('redirect_uri', gmailRedirectUri())
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('access_type', 'offline')
  u.searchParams.set('prompt', 'consent') // force refresh_token on every consent
  u.searchParams.set('include_granted_scopes', 'true')
  u.searchParams.set('scope', GMAIL_SCOPES)
  u.searchParams.set('state', state)
  return u.toString()
}

export async function exchangeCodeForTokens(code: string): Promise<{
  access_token: string
  refresh_token: string
  expires_in: number
  scope: string
  token_type: string
  id_token?: string
}> {
  const { clientId, clientSecret } = gmailClientCreds()
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: gmailRedirectUri(),
    grant_type: 'authorization_code',
  })
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`token exchange failed: ${res.status} ${text}`)
  }
  return res.json()
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string
  expires_in: number
  scope: string
  token_type: string
}> {
  const { clientId, clientSecret } = gmailClientCreds()
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
  })
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`refresh failed: ${res.status} ${text}`)
  }
  return res.json()
}

// Get a usable access_token for an account, refreshing & persisting if expired
export async function getAccessToken(account: GmailAccount): Promise<string> {
  const sb = createServiceClient()
  const now = Date.now()
  if (
    account.access_token &&
    account.access_token_expires_at &&
    new Date(account.access_token_expires_at).getTime() > now + 60_000
  ) {
    return account.access_token
  }
  const refreshed = await refreshAccessToken(account.refresh_token)
  const expiresAt = new Date(now + refreshed.expires_in * 1000).toISOString()
  await sb
    .from('keiri_gmail_accounts')
    .update({
      access_token: refreshed.access_token,
      access_token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', account.id)
  return refreshed.access_token
}

// ---- Google Drive helpers (請求書_受け箱 自動取込用。同じOAuthトークンを流用) ----

const DRIVE_BASE = 'https://www.googleapis.com/drive/v3'

export type DriveFileMeta = {
  id: string
  name: string
  mimeType: string
  size?: string
  createdTime?: string
}

export async function listDriveFolderFiles(
  accessToken: string,
  folderId: string,
  maxResults = 50,
): Promise<DriveFileMeta[]> {
  const u = new URL(`${DRIVE_BASE}/files`)
  u.searchParams.set('q', `'${folderId}' in parents and trashed = false`)
  u.searchParams.set('fields', 'files(id,name,mimeType,size,createdTime)')
  u.searchParams.set('pageSize', String(maxResults))
  u.searchParams.set('orderBy', 'createdTime')
  const res = await fetch(u.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`drive files.list ${res.status}: ${await res.text()}`)
  const data = (await res.json()) as { files?: DriveFileMeta[] }
  return data.files ?? []
}

export async function downloadDriveFile(
  accessToken: string,
  fileId: string,
): Promise<ArrayBuffer> {
  const res = await fetch(`${DRIVE_BASE}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`drive files.get ${res.status}: ${await res.text()}`)
  return res.arrayBuffer()
}

export async function fetchUserProfileEmail(accessToken: string): Promise<string> {
  const res = await fetch(`${GMAIL_BASE}/users/me/profile`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`profile fetch failed: ${res.status}`)
  const data = (await res.json()) as { emailAddress: string }
  return data.emailAddress
}

export async function listMessageIds(
  accessToken: string,
  query: string,
  maxResults = 30,
): Promise<{ id: string; threadId: string }[]> {
  const u = new URL(`${GMAIL_BASE}/users/me/messages`)
  u.searchParams.set('q', query)
  u.searchParams.set('maxResults', String(maxResults))
  const res = await fetch(u.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`gmail messages.list ${res.status}: ${await res.text()}`)
  const data = (await res.json()) as { messages?: { id: string; threadId: string }[] }
  return data.messages ?? []
}

type GmailHeader = { name: string; value: string }
type GmailPart = {
  mimeType?: string
  body?: { data?: string; size?: number }
  parts?: GmailPart[]
}
type GmailRawMessage = {
  id: string
  threadId: string
  internalDate: string
  snippet?: string
  payload?: {
    headers?: GmailHeader[]
    mimeType?: string
    body?: { data?: string }
    parts?: GmailPart[]
  }
}

function decodeBase64Url(b64: string): string {
  const normalized = b64.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(normalized, 'base64').toString('utf8')
}

function extractBody(payload: GmailRawMessage['payload']): { text: string; html: string | null } {
  if (!payload) return { text: '', html: null }
  let text = ''
  let html: string | null = null
  function walk(part: GmailPart | NonNullable<GmailRawMessage['payload']>) {
    const mime = part.mimeType ?? ''
    if (part.body?.data) {
      const decoded = decodeBase64Url(part.body.data)
      if (mime === 'text/plain') text += decoded + '\n'
      else if (mime === 'text/html') html = (html ?? '') + decoded
    }
    if ('parts' in part && part.parts) {
      for (const p of part.parts) walk(p)
    }
  }
  walk(payload)
  return { text: text.trim(), html }
}

export async function getMessage(accessToken: string, id: string): Promise<GmailMessage> {
  const res = await fetch(`${GMAIL_BASE}/users/me/messages/${id}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`gmail get ${res.status}: ${await res.text()}`)
  const raw = (await res.json()) as GmailRawMessage
  const headers = raw.payload?.headers ?? []
  const h = (name: string) => headers.find(x => x.name.toLowerCase() === name.toLowerCase())?.value ?? ''
  const { text, html } = extractBody(raw.payload)
  return {
    id: raw.id,
    threadId: raw.threadId,
    internalDate: raw.internalDate,
    subject: h('Subject'),
    from: h('From'),
    to: h('To'),
    date: h('Date'),
    snippet: raw.snippet ?? '',
    bodyText: text || raw.snippet || '',
    bodyHtml: html,
  }
}

export async function listActiveAccounts(): Promise<GmailAccount[]> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('keiri_gmail_accounts')
    .select('id, email, refresh_token, access_token, access_token_expires_at, last_polled_at, last_message_internal_date, active')
    .eq('active', true)
  if (error) throw new Error(error.message)
  return (data ?? []) as GmailAccount[]
}

export type SupplierRule = {
  id: string
  vendor: string
  email_pattern: string | null
  subject_pattern: string | null
  default_due_days: number
  default_category_id: string | null
}

export async function loadSupplierRules(): Promise<SupplierRule[]> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('keiri_supplier_email_rules')
    .select('id, vendor, email_pattern, subject_pattern, default_due_days, default_category_id')
    .eq('active', true)
  if (error) throw new Error(error.message)
  return (data ?? []) as SupplierRule[]
}

// Build a Gmail `q=` search query that finds messages from any of the configured
// supplier patterns since the given date. If no email_pattern is set on a rule,
// fall back to subject match for the vendor name.
export function buildSearchQuery(rules: SupplierRule[], sinceUnixSec: number): string {
  const fromClauses: string[] = []
  const subjectClauses: string[] = []
  for (const r of rules) {
    if (r.email_pattern) fromClauses.push(`from:${r.email_pattern}`)
    if (r.subject_pattern) subjectClauses.push(`subject:(${r.subject_pattern})`)
    else if (!r.email_pattern && r.vendor) subjectClauses.push(`subject:(${r.vendor})`)
  }
  const orParts: string[] = []
  if (fromClauses.length > 0) orParts.push(`(${fromClauses.join(' OR ')})`)
  if (subjectClauses.length > 0) orParts.push(`(${subjectClauses.join(' OR ')})`)
  const matcher = orParts.length === 0 ? '' : orParts.join(' OR ')
  return `${matcher ? `(${matcher}) ` : ''}after:${sinceUnixSec}`
}

export function matchRule(rules: SupplierRule[], from: string, subject: string): SupplierRule | null {
  const fromLower = from.toLowerCase()
  const subjLower = subject.toLowerCase()
  for (const r of rules) {
    if (r.email_pattern && fromLower.includes(r.email_pattern.toLowerCase())) return r
  }
  for (const r of rules) {
    if (r.subject_pattern) {
      try {
        const re = new RegExp(r.subject_pattern, 'i')
        if (re.test(subject)) return r
      } catch {
        if (subjLower.includes(r.subject_pattern.toLowerCase())) return r
      }
    }
    if (r.vendor && subjLower.includes(r.vendor.toLowerCase())) return r
  }
  return null
}
