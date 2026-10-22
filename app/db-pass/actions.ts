'use server'

// DB 通行証の受け渡しと、店舗端末の登録。
// 通行証を渡すのは「PIN ログイン中」か「店舗端末として登録済み」のときだけ。
import { cookies } from 'next/headers'
import { mintDbPass, type DbPassTokens } from '@/lib/auth/db-pass'
import { getSession } from '@/lib/auth/server'
import { signSession, verifySession } from '@/lib/auth/session'

const DEVICE_COOKIE = 'felicity_device'
const DEVICE_DAYS = 365

async function isRegisteredDevice(): Promise<boolean> {
  const jar = await cookies()
  const s = await verifySession(jar.get(DEVICE_COOKIE)?.value)
  return !!s && s.sid === 'device'
}

async function hasAccess(): Promise<boolean> {
  if (await getSession()) return true
  return isRegisteredDevice()
}

/**
 * 画面を開いたときに呼ぶ。
 * - 権限なし → { access:false }（ブラウザ側は通行証を捨てる）
 * - 権限あり・既に通行証あり → { access:true }
 * - 権限あり・通行証なし → { access:true, tokens }
 */
export async function syncDbPass(hasPass: boolean): Promise<{ access: boolean; tokens?: DbPassTokens }> {
  if (!(await hasAccess())) return { access: false }
  if (hasPass) return { access: true }
  const tokens = await mintDbPass()
  return tokens ? { access: true, tokens } : { access: true }
}

export async function getDeviceStatus(): Promise<boolean> {
  return isRegisteredDevice()
}

// 店舗の iPad / Mac など、ログインせずに置いておく端末を登録する（管理者のみ）。
export async function registerThisDevice(): Promise<boolean> {
  const s = await getSession()
  if (!s || s.role !== 'admin') return false
  const exp = Date.now() + DEVICE_DAYS * 86_400_000
  const token = await signSession({ role: 'staff', sid: 'device', name: 'shop-device', exp })
  const jar = await cookies()
  jar.set(DEVICE_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    expires: new Date(exp),
  })
  return true
}

export async function unregisterThisDevice(): Promise<boolean> {
  const s = await getSession()
  if (!s || s.role !== 'admin') return false
  const jar = await cookies()
  jar.delete(DEVICE_COOKIE)
  return true
}
