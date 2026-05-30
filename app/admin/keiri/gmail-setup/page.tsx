'use client'
export const dynamic = 'force-dynamic'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { getAdminSession } from '@/lib/session'
import {
  createSupplierRule,
  updateSupplierRule,
  deleteSupplierRule,
  toggleAccount,
  deleteAccount,
  type SupplierRuleInput,
} from './actions'

type Account = {
  id: string
  email: string
  active: boolean
  last_polled_at: string | null
  created_at: string
}

type Rule = {
  id: string
  vendor: string
  email_pattern: string | null
  subject_pattern: string | null
  default_due_days: number
  notes: string | null
  active: boolean
}

export default function GmailSetupPage() {
  return (
    <Suspense fallback={<main className="min-h-screen pt-8 px-4" style={{ backgroundColor: '#F5F0E8' }}><p className="text-stone-400 text-sm text-center">読み込み中...</p></main>}>
      <GmailSetupInner />
    </Suspense>
  )
}

function GmailSetupInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = useMemo(() => createClient(), [])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [rules, setRules] = useState<Rule[]>([])
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)
  const [showAdd, setShowAdd] = useState(false)
  const [polling, setPolling] = useState(false)

  // Add-form state
  const [newRule, setNewRule] = useState<SupplierRuleInput>({
    vendor: '',
    email_pattern: '',
    subject_pattern: '',
    default_due_days: 30,
    notes: '',
  })

  // editing
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<SupplierRuleInput | null>(null)

  useEffect(() => {
    if (!getAdminSession()) router.replace('/admin')
  }, [router])

  useEffect(() => {
    const connected = searchParams.get('connected')
    const error = searchParams.get('error')
    if (connected) toast.success(`${connected} を接続しました`)
    if (error) toast.error(`接続失敗: ${error}`)
  }, [searchParams])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const [accRes, ruleRes] = await Promise.all([
        supabase
          .from('keiri_gmail_accounts')
          .select('id, email, active, last_polled_at, created_at')
          .order('created_at'),
        supabase
          .from('keiri_supplier_email_rules')
          .select('id, vendor, email_pattern, subject_pattern, default_due_days, notes, active')
          .order('vendor'),
      ])
      if (cancelled) return
      setAccounts((accRes.data ?? []) as Account[])
      setRules((ruleRes.data ?? []) as Rule[])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [supabase, reload])

  function connectAccount(label: string) {
    window.location.href = `/api/keiri/gmail/oauth/start?label=${encodeURIComponent(label)}`
  }

  async function handleToggleAccount(a: Account) {
    try {
      await toggleAccount(a.id, !a.active)
      toast.success(a.active ? '無効化しました' : '有効化しました')
      setReload(n => n + 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'failed')
    }
  }

  async function handleDeleteAccount(a: Account) {
    if (!confirm(`${a.email} を削除しますか？（再連携が必要になります）`)) return
    try {
      await deleteAccount(a.id)
      toast.success('削除しました')
      setReload(n => n + 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'failed')
    }
  }

  async function handleAddRule() {
    if (!newRule.vendor.trim()) { toast.error('取引先名必須'); return }
    try {
      await createSupplierRule(newRule)
      toast.success('追加しました')
      setNewRule({ vendor: '', email_pattern: '', subject_pattern: '', default_due_days: 30, notes: '' })
      setShowAdd(false)
      setReload(n => n + 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'failed')
    }
  }

  async function handleDeleteRule(r: Rule) {
    if (!confirm(`「${r.vendor}」ルールを削除しますか？`)) return
    try {
      await deleteSupplierRule(r.id)
      toast.success('削除しました')
      setReload(n => n + 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'failed')
    }
  }

  function startEdit(r: Rule) {
    setEditingRuleId(r.id)
    setEditForm({
      vendor: r.vendor,
      email_pattern: r.email_pattern ?? '',
      subject_pattern: r.subject_pattern ?? '',
      default_due_days: r.default_due_days,
      notes: r.notes ?? '',
    })
  }

  async function saveEdit(id: string) {
    if (!editForm) return
    try {
      await updateSupplierRule(id, editForm)
      toast.success('保存しました')
      setEditingRuleId(null)
      setEditForm(null)
      setReload(n => n + 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'failed')
    }
  }

  async function pollNow() {
    setPolling(true)
    try {
      const res = await fetch('/api/cron/gmail-poll', { method: 'GET' })
      const data = await res.json()
      if (!res.ok) {
        toast.error(`取込失敗: ${data.error ?? 'unknown'}`)
      } else {
        const total = (data.accounts ?? []).reduce((s: number, a: { inserted?: number }) => s + (a.inserted ?? 0), 0)
        toast.success(`取込完了: 新規 ${total} 件`)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'failed')
    } finally {
      setPolling(false)
    }
  }

  return (
    <main className="min-h-screen pb-24 px-4 pt-8" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="max-w-lg mx-auto space-y-3">
        <div className="flex items-center justify-between">
          <button onClick={() => router.push('/admin/keiri')} className="text-stone-500 text-sm">← 戻る</button>
          <h1 className="text-lg font-semibold tracking-wider text-stone-800">Gmail 連携</h1>
          <div className="w-12" />
        </div>

        {/* Connected accounts */}
        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
          <p className="text-xs text-stone-500 tracking-wider">接続済 Gmail アカウント</p>
          {loading ? (
            <p className="text-stone-400 text-sm">読み込み中…</p>
          ) : accounts.length === 0 ? (
            <p className="text-stone-400 text-sm">未接続。下のボタンから接続してください。</p>
          ) : (
            <ul className="space-y-2">
              {accounts.map(a => (
                <li key={a.id} className="border-t border-stone-100 pt-2 first:border-0 first:pt-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-stone-800 truncate">{a.email}</p>
                      <p className="text-[10px] text-stone-400 mt-0.5">
                        {a.active ? '🟢 有効' : '⚪ 無効'}
                        {a.last_polled_at && ` ・最終取込 ${new Date(a.last_polled_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`}
                      </p>
                    </div>
                    <button
                      onClick={() => handleToggleAccount(a)}
                      className="text-xs px-2 py-1 bg-stone-100 text-stone-600 rounded-lg"
                    >
                      {a.active ? '無効化' : '有効化'}
                    </button>
                    <button
                      onClick={() => handleDeleteAccount(a)}
                      className="text-xs px-2 py-1 bg-rose-50 text-rose-600 rounded-lg"
                    >
                      削除
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-col gap-2 pt-2 border-t border-stone-100">
            <button
              onClick={() => connectAccount('rkirishima')}
              className="w-full bg-stone-800 text-white py-2.5 rounded-xl text-sm font-medium"
            >
              📧 rkirishima@gmail.com を接続
            </button>
            <button
              onClick={() => connectAccount('info')}
              className="w-full bg-stone-800 text-white py-2.5 rounded-xl text-sm font-medium"
            >
              📧 info@felicity.cafe を接続
            </button>
          </div>
        </div>

        {/* Manual poll */}
        <button
          onClick={pollNow}
          disabled={polling}
          className="w-full bg-emerald-700 text-white py-3 rounded-2xl font-medium disabled:opacity-50"
        >
          {polling ? '取込中…' : '🔄 今すぐ取り込む'}
        </button>

        {/* Supplier rules */}
        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-stone-500 tracking-wider">仕入先メールルール</p>
            <button
              onClick={() => setShowAdd(!showAdd)}
              className="text-xs text-emerald-700 px-2 py-1 bg-emerald-50 rounded-lg"
            >
              {showAdd ? '✕' : '+ 追加'}
            </button>
          </div>

          {showAdd && (
            <div className="bg-stone-50 rounded-xl p-3 space-y-2">
              <input
                type="text"
                placeholder="取引先名（例：Moonmade）"
                value={newRule.vendor}
                onChange={e => setNewRule({ ...newRule, vendor: e.target.value })}
                className="w-full bg-white rounded-lg px-2 py-1.5 text-sm border border-stone-200"
              />
              <input
                type="text"
                placeholder="送信元メール or ドメイン（例：moonmade.jp）"
                value={newRule.email_pattern ?? ''}
                onChange={e => setNewRule({ ...newRule, email_pattern: e.target.value })}
                className="w-full bg-white rounded-lg px-2 py-1.5 text-sm border border-stone-200"
              />
              <input
                type="text"
                placeholder="件名に含まれる語（任意）"
                value={newRule.subject_pattern ?? ''}
                onChange={e => setNewRule({ ...newRule, subject_pattern: e.target.value })}
                className="w-full bg-white rounded-lg px-2 py-1.5 text-sm border border-stone-200"
              />
              <div className="flex items-center gap-2">
                <span className="text-xs text-stone-500">期日デフォルト（日）</span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={newRule.default_due_days}
                  onChange={e => setNewRule({ ...newRule, default_due_days: parseInt(e.target.value, 10) || 30 })}
                  className="w-20 bg-white rounded-lg px-2 py-1.5 text-sm border border-stone-200"
                />
              </div>
              <input
                type="text"
                placeholder="メモ（任意）"
                value={newRule.notes ?? ''}
                onChange={e => setNewRule({ ...newRule, notes: e.target.value })}
                className="w-full bg-white rounded-lg px-2 py-1.5 text-sm border border-stone-200"
              />
              <button onClick={handleAddRule} className="w-full bg-stone-800 text-white py-1.5 rounded-lg text-sm">
                追加
              </button>
            </div>
          )}

          {loading ? (
            <p className="text-stone-400 text-sm">読み込み中…</p>
          ) : rules.length === 0 ? (
            <p className="text-stone-400 text-sm">ルール未登録</p>
          ) : (
            <ul className="space-y-2">
              {rules.map(r => {
                const isEdit = editingRuleId === r.id
                return (
                  <li key={r.id} className="border-t border-stone-100 pt-2 first:border-0 first:pt-0">
                    {isEdit && editForm ? (
                      <div className="space-y-1.5">
                        <input
                          type="text"
                          value={editForm.vendor}
                          onChange={e => setEditForm({ ...editForm, vendor: e.target.value })}
                          className="w-full bg-stone-50 rounded-lg px-2 py-1.5 text-sm border border-stone-200"
                        />
                        <input
                          type="text"
                          placeholder="ドメイン or メール"
                          value={editForm.email_pattern ?? ''}
                          onChange={e => setEditForm({ ...editForm, email_pattern: e.target.value })}
                          className="w-full bg-stone-50 rounded-lg px-2 py-1.5 text-sm border border-stone-200"
                        />
                        <input
                          type="text"
                          placeholder="件名キーワード"
                          value={editForm.subject_pattern ?? ''}
                          onChange={e => setEditForm({ ...editForm, subject_pattern: e.target.value })}
                          className="w-full bg-stone-50 rounded-lg px-2 py-1.5 text-sm border border-stone-200"
                        />
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-stone-500">期日</span>
                          <input
                            type="number"
                            inputMode="numeric"
                            value={editForm.default_due_days}
                            onChange={e => setEditForm({ ...editForm, default_due_days: parseInt(e.target.value, 10) || 30 })}
                            className="w-20 bg-stone-50 rounded-lg px-2 py-1.5 text-sm border border-stone-200"
                          />
                          <span className="text-xs text-stone-500">日</span>
                        </div>
                        <div className="flex gap-1.5">
                          <button onClick={() => saveEdit(r.id)} className="flex-1 bg-stone-800 text-white py-1.5 rounded-lg text-xs">保存</button>
                          <button onClick={() => setEditingRuleId(null)} className="px-3 py-1.5 bg-stone-100 text-stone-600 rounded-lg text-xs">キャンセル</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-between items-start gap-2 text-sm">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-stone-800">{r.vendor}</p>
                          <p className="text-[10px] text-stone-400 mt-0.5">
                            {r.email_pattern && <>📧 {r.email_pattern}</>}
                            {r.email_pattern && r.subject_pattern && ' / '}
                            {r.subject_pattern && <>件名: {r.subject_pattern}</>}
                            {!r.email_pattern && !r.subject_pattern && (
                              <span className="text-amber-700">📝 ドメイン未設定（取引先名で件名マッチ）</span>
                            )}
                          </p>
                          <p className="text-[10px] text-stone-400">期日デフォルト: {r.default_due_days}日</p>
                          {r.notes && <p className="text-[10px] text-stone-500 mt-0.5">{r.notes}</p>}
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => startEdit(r)} className="text-xs px-1.5 text-stone-500">✎</button>
                          <button onClick={() => handleDeleteRule(r)} className="text-xs px-1.5 text-rose-500">🗑</button>
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Help */}
        <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 text-xs text-stone-600 space-y-1.5">
          <p className="font-medium">💡 仕組み</p>
          <p>1. Gmail を接続（OAuth）すると refresh_token を安全に保存</p>
          <p>2. 30分ごとに新着メールを自動取得</p>
          <p>3. 仕入先ルールに合致したメールを Claude API が解析 → 仕入先・金額・期日を抽出</p>
          <p>4. 自動で「仕入れ未払」に追加 + Telegram 通知</p>
          <p>5. 期日 7日前 / 当日 に Telegram リマインダー</p>
          <p>6. 銀行 CSV を取り込むと取引先名・金額一致で自動で「支払済」マーク</p>
        </div>
      </div>
    </main>
  )
}
