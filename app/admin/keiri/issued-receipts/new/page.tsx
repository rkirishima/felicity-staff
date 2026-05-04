'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { getAdminSession } from '@/lib/session'
import { createIssuedReceipt } from '@/app/admin/keiri/issued-receipts/actions'
import { backCalcTax, type TaxRate } from '@/lib/keiri/tax'

const inputCls =
  'w-full bg-white rounded-xl px-3 py-2.5 text-sm border border-stone-200 outline-none focus:border-stone-400'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-stone-500 tracking-wider mb-1">{label}</span>
      {children}
    </label>
  )
}

function todayJST() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export default function NewIssuedReceiptPage() {
  const router = useRouter()
  const [clientName, setClientName] = useState('')
  const [issueDate, setIssueDate] = useState(todayJST())
  const [amount, setAmount] = useState('')
  const [taxRate, setTaxRate] = useState<TaxRate>(10)
  const [purpose, setPurpose] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!getAdminSession()) router.replace('/admin')
  }, [router])

  const amt = parseInt(amount || '0', 10) || 0
  const breakdown = useMemo(() => backCalcTax(amt, taxRate), [amt, taxRate])

  async function save() {
    setSaving(true)
    try {
      const out = await createIssuedReceipt({
        client_name: clientName,
        issue_date: issueDate,
        amount: amt,
        tax_rate: taxRate,
        purpose: purpose.trim() || null,
        payment_method: paymentMethod || null,
      })
      toast.success(`発行しました ${out.receipt_number}`)
      router.push(`/admin/keiri/issued-receipts/${out.id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="min-h-screen pb-24 px-4 pt-8" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="max-w-lg mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <button onClick={() => router.push('/admin/keiri/issued-receipts')} className="text-stone-500 text-sm">← 戻る</button>
          <h1 className="text-lg font-semibold tracking-wider text-stone-800">領収書を発行</h1>
          <span className="w-10" />
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
          <Field label="宛名 *">
            <input value={clientName} onChange={e => setClientName(e.target.value)} className={inputCls} />
          </Field>
          <Field label="発行日">
            <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="金額（税込・円）">
              <input
                inputMode="numeric"
                value={amount}
                onChange={e => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
                className={inputCls}
              />
            </Field>
            <Field label="税率">
              <select
                value={taxRate}
                onChange={e => setTaxRate(parseInt(e.target.value, 10) === 8 ? 8 : 10)}
                className={inputCls}
              >
                <option value={10}>10%</option>
                <option value={8}>8%</option>
              </select>
            </Field>
          </div>
          <div className="text-xs text-stone-500 space-y-0.5">
            <p>税抜金額: ¥{breakdown.exclTax.toLocaleString()}</p>
            <p>消費税: ¥{breakdown.tax.toLocaleString()}</p>
          </div>
          <Field label="但し書き">
            <input
              value={purpose}
              onChange={e => setPurpose(e.target.value)}
              className={inputCls}
              placeholder="例: 飲食代金"
            />
          </Field>
          <Field label="支払方法">
            <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className={inputCls}>
              <option value="">未指定</option>
              <option value="現金">現金</option>
              <option value="クレジット">クレジット</option>
              <option value="銀行振込">銀行振込</option>
              <option value="電子マネー">電子マネー</option>
              <option value="その他">その他</option>
            </select>
          </Field>
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="w-full bg-stone-800 text-white py-4 rounded-2xl font-medium shadow-sm disabled:opacity-40"
        >
          {saving ? '発行中...' : '発行する'}
        </button>
      </div>
    </main>
  )
}
