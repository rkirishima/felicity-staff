import { NextResponse, type NextRequest } from 'next/server'
import { AUTH_COOKIE, verifySession } from '@/lib/auth/session'

// /admin 配下のページはサーバーサイドで保護する（Next.js の proxy 規約。旧 middleware）。
// /admin 自体はPIN入力（ログイン導線）なので通す。未認証で深いページに
// 直リンクした場合は /admin へリダイレクトしてPIN入力させる。
// 認可ロールは admin / accountant（内部管理ロール）。staff・未認証は弾く。
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // ログイン導線と、その配下でない /admin ルートは素通し
  if (pathname === '/admin') return NextResponse.next()

  const token = req.cookies.get(AUTH_COOKIE)?.value
  const session = await verifySession(token)
  const authorized = session && (session.role === 'admin' || session.role === 'accountant')

  if (!authorized) {
    const url = req.nextUrl.clone()
    url.pathname = '/admin'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  // /admin 配下のみ（/admin 完全一致は上のロジックで通す）。API・静的資産は対象外。
  matcher: ['/admin/:path*'],
}
