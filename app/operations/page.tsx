'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { haptic } from '@/lib/utils'

const OPENING = [
  'エスプレッソマシン電源をつける（右下と正面の2つ、温度確認）',
  '食洗機・ワッフルマシン電源をつける',
  '布巾をよく洗いカウンターとキッチンに置いておく',
  '1・2階に掃除機・モップがけ（階段・洗面所も忘れずに）',
  '椅子を下ろして机を拭く',
  '2階のトイレ確認',
  'ゴミ箱の袋を開く',
  'グラインダーの電源をつけ、豆をセットする',
  'ジャグとポット・ケトル2つに水を入れる（消毒してから）',
  'エスプレッソマシンの設定・試し出し（シングル20ml・ダブル40ml、計り確認）',
  'カフィーザでスチーム、水入れ替えてもう一度スチーム',
  '仕込み必要なものを確認',
]

const CLOSING = [
  '2階のフロアランプ以外の電気・エアコンを消す',
  '1・2階の机を拭き椅子を上げる',
  'ワッフルマシンと台を拭く・バット類を食洗機にかける',
  'カウンター・カウンター下の棚を拭く（コーヒーかす・水など確認）',
  'ジャグ・ケトルの水を捨てる',
  '計りのカバー・ビーカー・ミルクピッチャーを食洗機にかける',
  'エスプレッソマシンの清掃（別紙マニュアル参照）',
  'ミルに残った豆の片し（こぼれたら拾う）',
  'エスプレッソマシン横のシンクをスポンジで洗う',
  'キッチンの作業台を拭く',
  '食洗機の電源を切り栓を抜く・中のカゴを洗う',
  '食洗機の上の台をスポンジで綺麗に・水気を布巾で拭く',
  '2つあるシンクの生ゴミネット確認',
  'エスプレッソかすのゴミ箱を綺麗にする（袋を閉じて布巾をかける）',
  '2階トイレ清掃・ペーパータオル補充・ゴミ箱確認',
  '在庫管理の連絡',
  'キッチンとカウンターのモップがけ',
  '最終確認（布巾全て集める・かす落ち・汚れチェック）',
  '大きいボウルで布巾をゆすぐ・漂白剤にしっかりつける',
  '入り口鍵かける・キッチンのシャッター2つおろす',
  '1階のエアコン・お湯の電源を消す',
  'キッチンのエアコンはオフ。ガレージのエアコンは除湿にしてつけておく（コーヒー豆管理）',
  '電気を消し・倉庫と表の鍵を閉める',
]

function OperationsContent() {
  const params = useSearchParams()
  const initialType = (params.get('type') as 'opening' | 'closing') || 'opening'
  const [type, setType] = useState<'opening' | 'closing'>(initialType)
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [restored, setRestored] = useState(false)
  const [fridgeTemp, setFridgeTemp] = useState('')
  const [coldTableTemp, setColdTableTemp] = useState('')
  const [freezerTemp, setFreezerTemp] = useState('')
  const [tempSaved, setTempSaved] = useState(false)
  const supabase = createClient()

  // チェック状態をJST日付ごとに localStorage へ保存。画面ロック・更新・タブ切替でも
  // 進捗が消えないようにする（開店/閉店で最も使う画面）。日付が変われば自然にリセット。
  const storageKey = `felicity_ops_${new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)}`
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) setChecked(JSON.parse(raw))
      // 古い日付の残骸を掃除
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i)
        if (k && k.startsWith('felicity_ops_') && k !== storageKey) localStorage.removeItem(k)
      }
    } catch {}
    setRestored(true)
  }, [storageKey])
  useEffect(() => {
    if (!restored) return // 復元前の空stateで上書きしない
    try {
      localStorage.setItem(storageKey, JSON.stringify(checked))
    } catch {}
  }, [checked, restored, storageKey])

  const items = type === 'opening' ? OPENING : CLOSING
  const doneCount = items.filter((_, i) => checked[`${type}-${i}`]).length
  const progress = Math.round((doneCount / items.length) * 100)

  function toggle(key: string) {
    haptic(10)
    setChecked(prev => ({ ...prev, [key]: !prev[key] }))
  }

  function checkAll() {
    const all: Record<string, boolean> = {}
    items.forEach((_, i) => { all[`${type}-${i}`] = true })
    setChecked(prev => ({ ...prev, ...all }))
  }

  async function saveTemps() {
    if (!fridgeTemp || !coldTableTemp || !freezerTemp) {
      toast.error('全ての温度を入力してください')
      return
    }
    const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0]
    const { error } = await supabase.from('temperature_logs').insert({
      date: today,
      fridge_temp: parseFloat(fridgeTemp),
      cold_table_temp: parseFloat(coldTableTemp),
      freezer_temp: parseFloat(freezerTemp),
    })
    // HACCP記録は失敗を握り潰さない（保存できていないのに成功表示は食品衛生上の欠陥）
    if (error) {
      toast.error('温度記録の保存に失敗しました: ' + error.message)
      return
    }
    toast.success('温度記録を保存しました')
    setTempSaved(true)
  }

  return (
    <main className="min-h-screen p-4 max-w-lg mx-auto pb-24" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="flex gap-2 mb-4">
        {(['opening', 'closing'] as const).map(t => (
          <button key={t} onClick={() => setType(t)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${type === t ? 'bg-stone-800 text-white' : 'bg-white text-stone-500 shadow-sm'}`}>
            {t === 'opening' ? '🌅 オープン' : '🌙 クローズ'}
          </button>
        ))}
      </div>

      <div className="mb-3">
        <div className="flex justify-between text-xs text-stone-400 mb-1">
          <span>{doneCount} / {items.length} 完了</span>
          <span>{progress}%</span>
        </div>
        <div className="w-full bg-stone-200 rounded-full h-2">
          <div className="bg-teal-500 h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <button onClick={checkAll}
          className="flex-1 py-2 bg-stone-800 text-white rounded-xl text-sm font-medium">
          ✅ 全部OK
        </button>
        <button onClick={() => setChecked(prev => {
            // 現在のタブ(opening/closing)の項目だけリセットし、もう一方の進捗は残す
            const next = { ...prev }
            items.forEach((_, i) => { delete next[`${type}-${i}`] })
            return next
          })}
          className="px-4 py-2 bg-white border border-stone-200 rounded-xl text-sm text-stone-500">
          リセット
        </button>
      </div>

      {type === 'opening' && (
        <div className="bg-white rounded-2xl shadow-sm p-4 mb-4">
          <p className="text-sm font-medium text-stone-700 mb-3">🌡️ 温度記録（必須）</p>
          <div className="space-y-2">
            {[
              { label: '冷蔵庫', val: fridgeTemp, set: setFridgeTemp, min: 0, max: 15 },
              { label: 'コールドテーブル', val: coldTableTemp, set: setColdTableTemp, min: 0, max: 15 },
              { label: '冷凍庫', val: freezerTemp, set: setFreezerTemp, min: -25, max: -10 },
            ].map(({ label, val, set, min, max }) => {
              const opts = Array.from({ length: max - min + 1 }, (_, i) => min + i)
              return (
                <div key={label} className="flex items-center gap-3">
                  <span className="text-sm text-stone-500 w-32">{label}</span>
                  <select value={val} onChange={e => set(e.target.value)}
                    className="flex-1 border border-stone-200 rounded-xl px-3 py-2 text-sm bg-white text-stone-800">
                    <option value="">選択</option>
                    {opts.map(n => <option key={n} value={String(n)}>{n}°C</option>)}
                  </select>
                </div>
              )
            })}
          </div>
          <button onClick={saveTemps} disabled={tempSaved}
            className={`w-full mt-3 py-2.5 rounded-xl text-sm font-medium transition-all ${tempSaved ? 'bg-teal-100 text-teal-600' : 'bg-stone-800 text-white'}`}>
            {tempSaved ? '✅ 温度記録済み' : '温度を記録する'}
          </button>
        </div>
      )}

      <div className="space-y-2">
        {items.map((item, i) => {
          const key = `${type}-${i}`
          const done = checked[key]
          return (
            <button key={key} onClick={() => toggle(key)}
              className={`w-full flex items-start gap-3 px-4 py-3 rounded-2xl text-sm text-left transition-all active:scale-[0.98] ${done ? 'bg-teal-50 border border-teal-200' : 'bg-white shadow-sm active:bg-stone-100'}`}>
              <span className="text-lg flex-shrink-0 mt-0.5">{done ? '✅' : '⬜'}</span>
              <span className={`flex-1 leading-snug ${done ? 'text-teal-700 line-through opacity-60' : 'text-stone-700'}`}>
                {item}
              </span>
            </button>
          )
        })}
      </div>

      {doneCount === items.length && (
        <div className="mt-6 p-6 bg-teal-50 border border-teal-200 rounded-2xl text-center">
          <p className="text-2xl mb-2">🎉</p>
          <p className="text-teal-700 font-bold text-lg">
            {type === 'opening' ? 'オープン準備完了！' : 'クローズ完了！'}
          </p>
        </div>
      )}

      <button onClick={() => window.history.back()} className="text-stone-400 text-xs mt-6 block">← 戻る</button>
    </main>
  )
}

export default function OperationsPage() {
  return <Suspense><OperationsContent /></Suspense>
}
