// サーバーサイド認証セッション（Edge/Node 両対応）。
// PINログイン成功時に HMAC 署名付きトークンを httpOnly cookie に載せ、
// middleware と API route が検証する。以前はクライアント localStorage だけで
// 実質ノーガードだった。
//
// トークン形式: base64url(JSON payload).hexHMAC
// payload: { role, sid, name, exp }  exp は epoch ミリ秒
//
// 署名鍵は SESSION_SECRET。未設定時は本番で必ず存在する
// SUPABASE_SERVICE_ROLE_KEY にフォールバックする（デプロイ時に新規env不要）。

export const AUTH_COOKIE = 'felicity_auth'

export type Role = 'admin' | 'accountant' | 'staff'

export type SessionPayload = {
  role: Role
  sid: string // staff id ('admin' = env PIN ログイン)
  name: string
  exp: number // epoch ms
}

function secretKey(): string {
  const s = process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!s) throw new Error('SESSION_SECRET / SUPABASE_SERVICE_ROLE_KEY not set')
  return s
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

async function hmac(payloadB64: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secretKey()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payloadB64))
  return toHex(new Uint8Array(sig))
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// JST の当日終端（翌0:00 JST）を expiry にする。既存の「日付が変わるとログアウト」挙動を踏襲。
export function endOfJstDayMs(): number {
  const nowJst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const y = nowJst.getUTCFullYear()
  const m = nowJst.getUTCMonth()
  const d = nowJst.getUTCDate()
  // 翌日0:00 JST = 前日15:00 UTC
  return Date.UTC(y, m, d + 1) - 9 * 60 * 60 * 1000
}

export async function signSession(input: Omit<SessionPayload, 'exp'> & { exp?: number }): Promise<string> {
  const payload: SessionPayload = { ...input, exp: input.exp ?? endOfJstDayMs() }
  const payloadB64 = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)))
  const sig = await hmac(payloadB64)
  return `${payloadB64}.${sig}`
}

export async function verifySession(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null
  const dot = token.lastIndexOf('.')
  if (dot < 0) return null
  const payloadB64 = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  let expected: string
  try {
    expected = await hmac(payloadB64)
  } catch {
    return null
  }
  if (!timingSafeEqualHex(sig, expected)) return null
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadB64))) as SessionPayload
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null
    return payload
  } catch {
    return null
  }
}
