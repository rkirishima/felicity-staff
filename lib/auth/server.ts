// サーバーアクション / route handler から使う認証ヘルパー。
// cookies() は next/headers（Node ランタイム）。middleware では使わないこと。
import { cookies } from 'next/headers'
import { AUTH_COOKIE, signSession, verifySession, type Role, type SessionPayload } from './session'

export async function setAuthCookie(input: { role: Role; sid: string; name: string }): Promise<void> {
  const token = await signSession(input)
  const jar = await cookies()
  const expMs = (await verifySession(token))?.exp ?? Date.now()
  jar.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    expires: new Date(expMs),
  })
}

export async function clearAuthCookie(): Promise<void> {
  const jar = await cookies()
  jar.delete(AUTH_COOKIE)
}

export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies()
  return verifySession(jar.get(AUTH_COOKIE)?.value)
}

// route handler 用: 権限が無ければ Response を返す。呼び出し側は
//   const denied = await requireRole(['admin','accountant']); if (denied) return denied
export async function requireRole(roles: Role[]): Promise<Response | null> {
  const session = await getSession()
  if (!session || !roles.includes(session.role)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
  }
  return null
}

// keiri 系は admin と accountant を許可、それ以外の管理系は admin のみ。
export function requireAdmin(): Promise<Response | null> {
  return requireRole(['admin'])
}

export function requireKeiri(): Promise<Response | null> {
  return requireRole(['admin', 'accountant'])
}
