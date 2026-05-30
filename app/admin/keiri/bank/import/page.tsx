'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { getAdminSession } from '@/lib/session'
import { importBankCsv } from '../actions'

export default function BankImportPage() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    if (!getAdminSession()) router.replace('/admin')
  }, [router])

  async function doImport() {
    if (!file) {
      toast.error('ファイルを選択してください')
      return
    }
    setImporting(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await importBankCsv(fd)
      const payableHint = res.payablesMatched > 0 ? `／未払${res.payablesMatched}件を自動支払済` : ''
      if (res.skipped > 0 && res.inserted === 0) {
        toast.success(`全${res.total}件すべて取込済み（重複スキップ）${payableHint}`)
      } else if (res.skipped > 0) {
        toast.success(`${res.inserted}件取込／${res.skipped}件は重複スキップ${payableHint}`)
      } else {
        toast.success(`${res.inserted}件 取り込みました${payableHint}`)
      }
      router.push('/admin/keiri/bank')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '取込失敗')
    } finally {
      setImporting(false)
    }
  }

  return (
    <main className="min-h-screen pb-24 px-4 pt-8" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="max-w-lg mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <button onClick={() => router.back()} className="text-stone-500 text-sm">
            ← 戻る
          </button>
          <h1 className="text-lg font-semibold tracking-wider text-stone-800">CSV取込</h1>
          <div className="w-12" />
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
          <div>
            <p className="text-xs text-stone-500 mb-2">手順</p>
            <ol className="text-sm text-stone-700 space-y-1 list-decimal list-inside">
              <li>SBIネット銀行の web から取引明細 CSV をダウンロード</li>
              <li>下のボタンでファイル選択</li>
              <li>「取り込む」をタップ</li>
            </ol>
          </div>

          <label className="block border-2 border-dashed border-stone-300 rounded-xl p-6 text-center cursor-pointer">
            {file ? (
              <div>
                <p className="text-sm text-stone-700">{file.name}</p>
                <p className="text-xs text-stone-400">{(file.size / 1024).toFixed(1)} KB</p>
                <p className="text-xs text-stone-400 mt-2">タップして別のファイルを選ぶ</p>
              </div>
            ) : (
              <>
                <p className="text-stone-500 text-sm">CSV ファイルを選択</p>
                <p className="text-stone-300 text-xs mt-1">タップしてファイルを選ぶ</p>
              </>
            )}
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
            />
          </label>

          <button
            onClick={doImport}
            disabled={!file || importing}
            className="w-full bg-stone-800 text-white py-3 rounded-xl font-medium disabled:opacity-50"
          >
            {importing ? '取込中...' : '取り込む'}
          </button>
        </div>

        <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 text-xs text-stone-600 space-y-1">
          <p className="font-medium">対応形式</p>
          <p>・カラム: 取引日 / 摘要 / 入金 / 出金 / 残高（順不同 OK）</p>
          <p>・エンコーディング: Shift-JIS / UTF-8 自動判定</p>
          <p>・日付形式: YYYY/MM/DD or YYYY-MM-DD</p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-xs text-blue-800 space-y-1">
          <p className="font-medium">💡 重複スキップ</p>
          <p>同じ取引（取引日・摘要・入出金額・残高がすべて一致）はスキップされます。何月分のCSVでも、いつ取り込んでも、同じ行は二重計上されません。</p>
        </div>
      </div>
    </main>
  )
}
