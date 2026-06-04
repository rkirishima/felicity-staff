'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { getAdminSession } from '@/lib/session'
import { importAmazonCsv } from '../actions'

type FileResult = {
  name: string
  ok: boolean
  inserted_orders?: number
  skipped_orders?: number
  inserted_items?: number
  unclassified?: number
  bank_matched?: number
  error?: string
}

export default function AmazonImportPage() {
  const router = useRouter()
  const [files, setFiles] = useState<File[]>([])
  const [importing, setImporting] = useState(false)
  const [results, setResults] = useState<FileResult[]>([])

  useEffect(() => {
    if (!getAdminSession()) router.replace('/admin')
  }, [router])

  async function doImport() {
    if (files.length === 0) {
      toast.error('ファイルを選択してください')
      return
    }
    setImporting(true)
    setResults([])
    const acc: FileResult[] = []
    let totalOrders = 0
    let totalItems = 0
    let totalUnclassified = 0
    let totalBank = 0
    let errors = 0
    for (const f of files) {
      try {
        const fd = new FormData()
        fd.append('file', f)
        const res = await importAmazonCsv(fd)
        acc.push({ name: f.name, ok: true, ...res })
        totalOrders += res.inserted_orders
        totalItems += res.inserted_items
        totalUnclassified += res.unclassified
        totalBank += res.bank_matched
      } catch (e) {
        acc.push({ name: f.name, ok: false, error: e instanceof Error ? e.message : '取込失敗' })
        errors++
      }
      setResults([...acc])
    }
    setImporting(false)
    if (errors === 0) {
      const bankHint = totalBank > 0 ? `／銀行${totalBank}件と自動紐付け` : ''
      const unHint = totalUnclassified > 0 ? `／未分類${totalUnclassified}件` : ''
      toast.success(`${totalOrders}注文 ${totalItems}明細 取込完了${bankHint}${unHint}`)
      setTimeout(() => router.push('/admin/keiri/amazon'), 1500)
    } else {
      toast.error(`${errors}ファイル失敗 / ${files.length - errors}ファイル成功`)
    }
  }

  return (
    <main className="min-h-screen pb-24 px-4 pt-8" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="max-w-lg mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <button onClick={() => router.back()} className="text-stone-500 text-sm">
            ← 戻る
          </button>
          <h1 className="text-lg font-semibold tracking-wider text-stone-800">Amazon CSV取込</h1>
          <div className="w-12" />
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
          <div>
            <p className="text-xs text-stone-500 mb-2">手順</p>
            <ol className="text-sm text-stone-700 space-y-1 list-decimal list-inside">
              <li>Amazon Business → 注文履歴 → ダウンロード → 「Items Report」CSVを選択</li>
              <li>下のボタンで複数ファイルを選択可</li>
              <li>「取り込む」をタップ</li>
            </ol>
          </div>

          <label className="block border-2 border-dashed border-stone-300 rounded-xl p-6 text-center cursor-pointer">
            {files.length > 0 ? (
              <div className="space-y-1">
                <p className="text-sm text-stone-700 font-medium">{files.length}ファイル選択中</p>
                <ul className="text-xs text-stone-500 space-y-0.5 max-h-32 overflow-y-auto">
                  {files.map((f, i) => (
                    <li key={i} className="truncate">{f.name} <span className="text-stone-400">({(f.size / 1024).toFixed(1)} KB)</span></li>
                  ))}
                </ul>
                <p className="text-xs text-stone-400 mt-2">タップして選び直す</p>
              </div>
            ) : (
              <>
                <p className="text-stone-500 text-sm">CSV ファイルを選択（複数OK）</p>
                <p className="text-stone-300 text-xs mt-1">タップして複数選択可</p>
              </>
            )}
            <input
              type="file"
              accept=".csv,text/csv"
              multiple
              className="hidden"
              onChange={e => setFiles(Array.from(e.target.files ?? []))}
            />
          </label>

          <button
            onClick={doImport}
            disabled={files.length === 0 || importing}
            className="w-full bg-orange-600 text-white py-3 rounded-xl font-medium disabled:opacity-50"
          >
            {importing ? `取込中... (${results.length}/${files.length})` : files.length > 1 ? `${files.length}ファイル取り込む` : '取り込む'}
          </button>

          {results.length > 0 && (
            <ul className="text-xs space-y-1 pt-2 border-t border-stone-100">
              {results.map((r, i) => (
                <li key={i} className={`flex items-start justify-between gap-2 ${r.ok ? 'text-stone-600' : 'text-rose-700'}`}>
                  <span className="truncate flex-1">{r.ok ? '✓' : '✕'} {r.name}</span>
                  <span className="text-right whitespace-nowrap">
                    {r.ok
                      ? `${r.inserted_orders}注文/${r.inserted_items}明細${r.bank_matched ? `/銀行${r.bank_matched}` : ''}`
                      : r.error}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-xs text-blue-800 space-y-1">
          <p className="font-medium">💡 自動処理</p>
          <p>・商品名から勘定科目を自動分類（消耗品費／食材仕入／通信費等）</p>
          <p>・銀行CSVで取り込み済みの出金と日付+金額で自動マッチ</p>
          <p>・税理士レポートに証跡として自動収録</p>
        </div>
      </div>
    </main>
  )
}
