'use server'

// スタッフの編集（ロール・在籍・時給・支払方法・所属）は admin だけに許可する。
// これまでブラウザから anon キーで直接 staff を更新していたため、サーバー側の
// ロール検査が無く「アドミンだけ」を強制できていなかった。ここで felicity_auth
// cookie のロールを検証し、service role で更新する（proxy は accountant も
// /admin 配下に通すので、ここで admin 以外を弾くことが実際のゲートになる）。
import { createAdminClient } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth/server'

type Role = 'staff' | 'admin' | 'accountant'
type StaffPatch = {
  role?: Role
  active?: boolean
  hourly_rate?: number
  payment_method?: 'transfer' | 'cash'
  employer?: 'cafe' | 'fcr'
}

export async function updateStaff(
  id: string,
  patch: StaffPatch,
): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return { ok: false, error: '管理者のみ変更できます' }
  }
  if (!id) return { ok: false, error: 'スタッフ ID がありません' }

  const payload: Record<string, unknown> = {}

  if (patch.role !== undefined) {
    if (!['staff', 'admin', 'accountant'].includes(patch.role)) {
      return { ok: false, error: 'ロールが不正です' }
    }
    payload.role = patch.role
  }
  if (patch.active !== undefined) payload.active = !!patch.active
  if (patch.hourly_rate !== undefined) {
    const r = Number(patch.hourly_rate)
    if (!Number.isInteger(r) || r < 0) return { ok: false, error: '時給は0以上の整数で入力してください' }
    payload.hourly_rate = r
  }
  if (patch.payment_method !== undefined) {
    if (patch.payment_method !== 'transfer' && patch.payment_method !== 'cash') {
      return { ok: false, error: '支払方法が不正です' }
    }
    payload.payment_method = patch.payment_method
  }
  if (patch.employer !== undefined) {
    if (patch.employer !== 'cafe' && patch.employer !== 'fcr') {
      return { ok: false, error: '所属が不正です' }
    }
    payload.employer = patch.employer
  }

  if (Object.keys(payload).length === 0) return { ok: true }

  const sb = createAdminClient()
  const { error } = await sb.from('staff').update(payload).eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
