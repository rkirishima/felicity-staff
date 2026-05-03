'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { getAdminSession } from '@/lib/session'
import type { ReceiptOcr } from '@/lib/keiri/ocr'

type Step = 'pick' | 'ocr' | 'review'
type Category = { id: string; name: string; tax_category: string | null; type: string }

function todayJST() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-stone-500 tracking-wider mb-1">{label}</span>
      {children}
    </label>
  )
}

const inputCls =
  'w-full bg-white rounded-xl px-3 py-2.5 text-sm border border-stone-200 outline-none focus:border-stone-400'

export default function ReceiptUploadPage() {
  const router = useRouter()
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('pick')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [imageBlob, setImageBlob] = useState<Blob | null>(null)
  const [normalizedB64, setNormalizedB64] = useState<string | null>(null)
  const [ocr, setOcr] = useState<ReceiptOcr | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [saving, setSaving] = useState(false)

  const [date, setDate] = useState(todayJST())
  const [vendor, setVendor] = useState('')
  const [total, setTotal] = useState('')
  const [taxAmount, setTaxAmount] = useState('')
  const [taxRate, setTaxRate] = useState<10 | 8>(10)
  const [categoryId, setCategoryId] = useState<string>('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [registrationNumber, setRegistrationNumber] = useState('')
  const [memo, setMemo] = useState('')

  useEffect(() => {
    if (!getAdminSession()) {
      router.replace('/admin')
      return
    }
    ;(async () => {
      const { data } = await supabase
        .from('keiri_categories')
        .select('id, name, tax_category, type')
        .eq('type', 'expense')
        .order('name')
      setCategories((data ?? []) as Category[])
    })()
  }, [router, supabase])

  function pickFile() {
    fileRef.current?.click()
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImageBlob(file)
    setPreviewUrl(URL.createObjectURL(file))
    setStep('ocr')
    await runOcr(file)
  }

  async function runOcr(file: Blob) {
    try {
      const form = new FormData()
      form.append('image', file)
      const res = await fetch('/api/keiri/ocr', { method: 'POST', body: form })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'OCR failed')
      const parsed = data.parsed as ReceiptOcr
      setOcr(parsed)
      setNormalizedB64(data.normalized_base64 as string)

      setDate(parsed.date || todayJST())
      setVendor(parsed.vendor || '')
      setTotal(parsed.total != null ? String(parsed.total) : '')
      setTaxAmount(parsed.tax_amount != null ? String(parsed.tax_amount) : '')
      setTaxRate(parsed.tax_rate === 8 ? 8 : 10)
      setPaymentMethod(parsed.payment_method || '')
      setRegistrationNumber(parsed.registration_number || '')
      setStep('review')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`OCR エラー: ${msg}`)
      setStep('pick')
    }
  }

  useEffect(() => {
    if (step !== 'review' || categories.length === 0 || !ocr?.category_guess) return
    const match = categories.find(c => c.name === ocr.category_guess)
    if (match) setCategoryId(prev => prev || match.id)
  }, [step, categories, ocr])

  async function handleSave() {
    if (!imageBlob || !normalizedB64) {
      toast.error('画像が未選択です')
      return
    }
    const totalNum = parseInt(total, 10)
    if (!Number.isFinite(totalNum) || totalNum <= 0) {
      toast.error('合計金額を入力してください')
      return
    }
    if (!categoryId) {
      toast.error('勘定科目を選択してください')
      return
    }
    const taxAmountNum = taxAmount ? parseInt(taxAmount, 10) : Math.round(totalNum - totalNum / (1 + taxRate / 100))
    const cat = categories.find(c => c.id === categoryId)
    const taxCategory = cat?.tax_category ?? (taxRate === 8 ? '軽減8' : '物販10')

    setSaving(true)
    try {
      const fileName = `${date}/${Date.now()}.jpg`
      const jpegBytes = Uint8Array.from(atob(normalizedB64), c => c.charCodeAt(0))
      const { error: upErr } = await supabase.storage
        .from('keiri-receipts')
        .upload(fileName, jpegBytes, { contentType: 'image/jpeg', upsert: false })
      if (upErr) throw upErr

      const { data: receiptRow, error: rErr } = await supabase
        .from('keiri_receipts')
        .insert({
          status: 'confirmed',
          image_path: fileName,
          ocr_json: ocr,
          date,
          vendor,
          total: totalNum,
          tax_amount: taxAmountNum,
          tax_rate: taxRate,
          payment_method: paymentMethod || null,
          registration_number: registrationNumber || null,
          memo: memo || null,
        })
        .select('id')
        .single()
      if (rErr) throw rErr

      const { data: txRow, error: tErr } = await supabase
        .from('keiri_transactions')
        .insert({
          type: 'expense',
          source: 'receipt',
          receipt_id: receiptRow.id,
          date,
          amount: totalNum,
          tax_amount: taxAmountNum,
          tax_rate: taxRate,
          tax_category: taxCategory,
          category_id: categoryId,
          vendor,
          payment_method: paymentMethod || null,
          memo: memo || null,
        })
        .select('id')
        .single()
      if (tErr) throw tErr

      await supabase
        .from('keiri_receipts')
        .update({ transaction_id: txRow.id })
        .eq('id', receiptRow.id)

      toast.success('保存しました')
      router.push('/admin/keiri/expenses')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`保存失敗: ${msg}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="min-h-screen pb-24 px-4 pt-8" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="max-w-lg mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <button onClick={() => router.push('/admin/keiri')} className="text-stone-500 text-sm">← 戻る</button>
          <h1 className="text-lg font-semibold tracking-wider text-stone-800">レシート撮影</h1>
          <span className="w-10" />
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onFileChange}
          className="hidden"
        />

        {step === 'pick' && (
          <div className="space-y-4">
            <button onClick={pickFile} className="w-full bg-stone-800 text-white py-6 rounded-2xl text-base font-medium shadow-sm">
              📷 撮影 / 画像を選択
            </button>
            <p className="text-xs text-stone-500 text-center">レシート/領収書を撮影してください</p>
          </div>
        )}

        {step === 'ocr' && (
          <div className="space-y-4">
            {previewUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="preview" className="w-full rounded-2xl shadow-sm" />
            )}
            <p className="text-center text-stone-600 text-sm">解析中...</p>
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-4">
            {previewUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="preview" className="w-full rounded-2xl shadow-sm" />
            )}

            {ocr && ocr.confidence < 0.7 && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2">
                ⚠️ OCR の確信度が低いです（{Math.round(ocr.confidence * 100)}%）。内容を確認してください。
              </p>
            )}

            <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
              <Field label="日付">
                <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
              </Field>
              <Field label="取引先">
                <input value={vendor} onChange={e => setVendor(e.target.value)} className={inputCls} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="合計（税込・円）">
                  <input
                    inputMode="numeric"
                    value={total}
                    onChange={e => setTotal(e.target.value.replace(/[^0-9]/g, ''))}
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
              <Field label="消費税額（円）">
                <input
                  inputMode="numeric"
                  value={taxAmount}
                  onChange={e => setTaxAmount(e.target.value.replace(/[^0-9]/g, ''))}
                  className={inputCls}
                  placeholder="自動計算（税込から逆算）"
                />
              </Field>
              <Field label="勘定科目">
                <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className={inputCls}>
                  <option value="">選択してください</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="支払方法">
                <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className={inputCls}>
                  <option value="">未指定</option>
                  <option value="現金">現金</option>
                  <option value="クレジット">クレジット</option>
                  <option value="電子マネー">電子マネー</option>
                  <option value="その他">その他</option>
                </select>
              </Field>
              <Field label="登録番号（T+13桁）">
                <input
                  value={registrationNumber}
                  onChange={e => setRegistrationNumber(e.target.value)}
                  className={inputCls}
                  placeholder="例: T1234567890123"
                />
              </Field>
              <Field label="メモ">
                <textarea value={memo} onChange={e => setMemo(e.target.value)} className={inputCls} rows={2} />
              </Field>
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-stone-800 text-white py-4 rounded-2xl font-medium shadow-sm disabled:opacity-40"
            >
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
