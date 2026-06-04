'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { getAdminSession } from '@/lib/session'
import { importBankCsv } from '../actions'

type FileResult = { name: string; ok: boolean; inserted?: number; skipped?: number; total?: number; payablesMatched?: number; error?: string }

export default function BankImportPage() {
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
    let totalInserted = 0
    let totalSkipped = 0
    let totalPayables = 0
    let errorCount = 0
    for (const f of files) {
      try {
        const fd = new FormData()
        fd.append('file', f)
        const res = await importBankCsv(fd)
        acc.push({ name: f.name, ok: true, ...res })
        totalInserted += res.inserted
        totalSkipped += res.skipped
        totalPayables += res.payablesMatched
      } catch (e) {
        acc.push({ name: f.name, ok: false, error: e instanceof Error ? e.message : '取込失敗' })
        errorCount++
      }
      setResults([...acc])
    }
    setImporting(false)
    const payableHint = totalPayables > 0 ? `／未払${totalPayables}件を自動支払済` : ''
    if (errorCount === 0) {
      toast.success(`全${files.length}ファイル取込完了: ${totalInserted}件 新規／${totalSkipped}件 重複スキップ${payableHint}`)
      setTimeout(() => router.push('/admin/keiri/bank'), 1200)
    } else {
      toast.error(`${errorCount}ファイル失敗 / ${files.length - errorCount}ファイル成功`)
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
            className="w-full bg-stone-800 text-white py-3 rounded-xl font-medium disabled:opacity-50"
          >
            {importing ? `取込中... (${results.length}/${files.length})` : files.length > 1 ? `${files.length}ファイル取り込む` : '取り込む'}
          </button>

          {results.length > 0 && (
            <ul className="text-xs space-y-1 pt-2 border-t border-stone-100">
              {results.map((r, i) => (
                <li key={i} className={`flex items-start justify-between gap-2 ${r.ok ? 'text-stone-600' : 'text-rose-700'}`}>
                  <span className="truncate flex-1">
                    {r.ok ? '✓' : '✕'} {r.name}
                  </span>
                  <span className="text-right whitespace-nowrap">
                    {r.ok
                      ? `${r.inserted}新規/${r.skipped}重複`
                      : r.error}
                  </span>
                </li>
              ))}
            </ul>
          )}
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
