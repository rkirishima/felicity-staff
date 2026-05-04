'use client'
export const dynamic = 'force-dynamic'

import { use, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { getAdminSession } from '@/lib/session'
import { cancelIssuedReceipt } from '@/app/admin/keiri/issued-receipts/actions'

type Row = {
  id: string
  receipt_number: string
  client_name: string
  issue_date: string
  amount: number
  excl_tax: number
  tax: number
  tax_rate: number
  purpose: string | null
  payment_method: string | null
  status: string
  pdf_path: string | null
}

export default function IssuedReceiptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [row, setRow] = useState<Row | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!getAdminSession()) {
      router.replace('/admin')
      return
    }
    ;(async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('keiri_receipts_issued')
        .select('*')
        .eq('id', id)
        .single()
      if (error || !data) {
        toast.error('領収書が見つかりません')
        router.replace('/admin/keiri/issued-receipts')
        return
      }
      setRow(data as Row)
      setLoading(false)
    })()
  }, [id, router, supabase])

  async function cancel() {
    if (!confirm('この領収書をキャンセルしますか?')) return
    setBusy(true)
    try {
      await cancelIssuedReceipt(id)
      toast.success('キャンセルしました')
      setRow(prev => (prev ? { ...prev, status: 'cancelled' } : prev))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (loading || !row) {
    return (
      <main className="min-h-screen pb-24 px-4 pt-8" style={{ backgroundColor: '#F5F0E8' }}>
        <p className="text-center text-stone-400 text-sm py-12">読み込み中...</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen pb-24 px-4 pt-8" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="max-w-lg mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <button onClick={() => router.push('/admin/keiri/issued-receipts')} className="text-stone-500 text-sm">← 戻る</button>
          <h1 className="text-lg font-semibold tracking-wider text-stone-800">{row.receipt_number}</h1>
          <span className="w-10" />
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-stone-700">{row.client_name} 様</p>
            {row.status === 'cancelled' && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-50 text-red-600">キャンセル</span>
            )}
          </div>
          <p className="text-xs text-stone-500">発行日: {row.issue_date}</p>
          <p className="text-3xl font-light text-stone-900 pt-2">¥{row.amount.toLocaleString()}</p>
          <div className="text-xs text-stone-500 space-y-0.5 pt-1">
            <p>税抜金額（{row.tax_rate}%対象）: ¥{row.excl_tax.toLocaleString()}</p>
            <p>消費税（{row.tax_rate}%）: ¥{row.tax.toLocaleString()}</p>
            {row.payment_method && <p>支払方法: {row.payment_method}</p>}
            {row.purpose && <p>但し書き: {row.purpose}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <a
            href={`/api/keiri/issued-receipts/${id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-stone-800 text-white py-4 rounded-2xl font-medium shadow-sm text-center"
          >
            PDF を開く
          </a>
          <a
            href={`/api/keiri/issued-receipts/${id}/pdf?regenerate=1`}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-white border border-stone-300 text-stone-600 py-4 rounded-2xl text-sm shadow-sm text-center"
          >
            PDF 再生成
          </a>
        </div>

        {row.status !== 'cancelled' && (
          <button
            onClick={cancel}
            disabled={busy}
            className="w-full bg-white border border-stone-300 text-stone-600 py-3 rounded-2xl text-sm shadow-sm disabled:opacity-40"
          >
            この領収書をキャンセル
          </button>
        )}
      </div>
    </main>
  )
}
