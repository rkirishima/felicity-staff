'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { fmtSec, mmssToSec } from '@/lib/roast/profile'
import type { RecipeStep, RecipeTargets } from '@/lib/roast/recipe'

type Base = { charge_temp_c: number | null; drum_pct: number | null; steps: RecipeStep[]; targets: RecipeTargets; watch: string | null }
type Row = { t: string; bt: string; gas: string; fan: string; drum: string; note: string }

const s = (v: number | null | undefined) => (v == null ? '' : String(v))
const tm = (v: number | null | undefined) => (v == null ? '' : fmtSec(v))
/** "9:05" / "545" どちらでも秒に */
const toSec = (v: string): number | null => {
  const x = v.trim()
  if (!x) return null
  return x.includes(':') ? mmssToSec(x) : Number.isFinite(Number(x)) ? Number(x) : null
}

const inputCls = 'w-full bg-stone-900 text-white rounded-lg px-2 py-2 text-sm border border-stone-700 tabular-nums'

function Field({ label, value, onChange, placeholder, mode = 'decimal' }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; mode?: 'decimal' | 'text' }) {
  return (
    <label className="block">
      <span className="text-[11px] text-stone-400">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} inputMode={mode} className={inputCls} />
    </label>
  )
}

/** レシピの手動編集。時間は「9:05」の形で入力する */
export function RecipeEditor({ base, saving, onSave, onCancel }: {
  base: Base | null
  saving: boolean
  onSave: (recipe: Record<string, unknown>) => void
  onCancel: () => void
}) {
  const t = base?.targets ?? {}
  const [charge, setCharge] = useState(s(base?.charge_temp_c))
  const [drum, setDrum] = useState(s(base?.drum_pct))
  const [tg, setTg] = useState({
    tp_s: tm(t.tp_s), yellow_s: tm(t.yellow_s), fc_s: tm(t.fc_s), fc_c: s(t.fc_c),
    drop_s: tm(t.drop_s), drop_c: s(t.drop_c), wl_lo: s(t.wl_lo), wl_hi: s(t.wl_hi),
  })
  const [rows, setRows] = useState<Row[]>(
    (base?.steps?.length ? base.steps : [{ t: 0, bt: null, gas: null, fan: null, drum: null }]).map((x) => ({
      t: tm(x.t), bt: s(x.bt), gas: s(x.gas), fan: s(x.fan), drum: s(x.drum), note: x.note ?? '',
    })),
  )
  const [watch, setWatch] = useState(base?.watch ?? '')

  const setRow = (i: number, k: keyof Row, v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)))
  const fc = toSec(tg.fc_s)
  const drop = toSec(tg.drop_s)
  const dev = fc != null && drop != null && drop > fc ? drop - fc : null

  function save() {
    onSave({
      charge_temp_c: charge,
      drum_pct: drum,
      watch,
      targets: {
        tp_s: toSec(tg.tp_s), yellow_s: toSec(tg.yellow_s), fc_s: fc, fc_c: tg.fc_c,
        drop_s: drop, drop_c: tg.drop_c, wl_lo: tg.wl_lo, wl_hi: tg.wl_hi,
      },
      steps: rows.map((r) => ({ t: toSec(r.t), bt: r.bt, gas: r.gas, fan: r.fan, drum: r.drum, note: r.note })),
    })
  }

  return (
    <div className="rounded-2xl p-4 space-y-4" style={{ backgroundColor: '#1c1917', border: '1px solid #b45309' }}>
      <p className="text-sm font-bold text-amber-200">レシピを編集（時間は 9:05 のように入力）</p>

      <div className="grid grid-cols-2 gap-2">
        <Field label="投入（豆温度 °C）" value={charge} onChange={setCharge} />
        <Field label="ドラム" value={drum} onChange={setDrum} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Field label="ボトム 時刻" value={tg.tp_s} onChange={(v) => setTg({ ...tg, tp_s: v })} placeholder="1:05" mode="text" />
        <Field label="150°C 時刻" value={tg.yellow_s} onChange={(v) => setTg({ ...tg, yellow_s: v })} placeholder="5:00" mode="text" />
        <Field label="1ハゼ 時刻" value={tg.fc_s} onChange={(v) => setTg({ ...tg, fc_s: v })} placeholder="8:50" mode="text" />
        <Field label="1ハゼ °C" value={tg.fc_c} onChange={(v) => setTg({ ...tg, fc_c: v })} />
        <Field label="ドロップ 時刻" value={tg.drop_s} onChange={(v) => setTg({ ...tg, drop_s: v })} placeholder="10:40" mode="text" />
        <Field label="ドロップ °C" value={tg.drop_c} onChange={(v) => setTg({ ...tg, drop_c: v })} />
        <Field label="重量減 下限 %" value={tg.wl_lo} onChange={(v) => setTg({ ...tg, wl_lo: v })} />
        <Field label="重量減 上限 %" value={tg.wl_hi} onChange={(v) => setTg({ ...tg, wl_hi: v })} />
      </div>
      <p className="text-xs text-stone-400 tabular-nums">発達 {dev != null ? `${fmtSec(dev)}（DTR ${((dev / (drop as number)) * 100).toFixed(1)}%）` : '—'}（1ハゼとドロップから自動計算）</p>

      <div className="space-y-1.5">
        <div className="grid grid-cols-[3.6rem_3.4rem_3rem_3rem_3rem_1fr_1.8rem] gap-1 text-[10px] text-stone-400 px-1">
          <span>時刻</span><span>豆°C</span><span>ガス</span><span>ファン</span><span>ドラム</span><span>メモ</span><span />
        </div>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[3.6rem_3.4rem_3rem_3rem_3rem_1fr_1.8rem] gap-1 items-center">
            <input value={r.t} onChange={(e) => setRow(i, 't', e.target.value)} placeholder="0:00" className={inputCls} aria-label="時刻" />
            <input value={r.bt} onChange={(e) => setRow(i, 'bt', e.target.value)} inputMode="decimal" className={inputCls} aria-label="豆温度" />
            <input value={r.gas} onChange={(e) => setRow(i, 'gas', e.target.value)} inputMode="decimal" className={inputCls} aria-label="ガス" />
            <input value={r.fan} onChange={(e) => setRow(i, 'fan', e.target.value)} inputMode="decimal" className={inputCls} aria-label="ファン" />
            <input value={r.drum} onChange={(e) => setRow(i, 'drum', e.target.value)} inputMode="decimal" className={inputCls} aria-label="ドラム" />
            <input value={r.note} onChange={(e) => setRow(i, 'note', e.target.value)} className={inputCls} aria-label="メモ" />
            <button type="button" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className="text-stone-500 p-1" aria-label="この行を削除">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setRows((rs) => [...rs, { t: '', bt: '', gas: '', fan: '', drum: '', note: '' }])}
          className="w-full rounded-lg py-2 bg-stone-800 text-stone-300 text-sm flex items-center justify-center gap-1">
          <Plus size={14} />行を追加
        </button>
        <p className="text-[11px] text-stone-500">空欄は「変更なし」。時刻順に並べ替えて保存します。</p>
      </div>

      <label className="block">
        <span className="text-[11px] text-stone-400">焙煎中に一番気をつけること（1行）</span>
        <textarea value={watch} onChange={(e) => setWatch(e.target.value)} rows={2}
          className="w-full bg-stone-900 text-white rounded-lg px-3 py-2 text-sm border border-stone-700 resize-none" />
      </label>

      <div className="grid grid-cols-[auto_1fr] gap-2">
        <button type="button" onClick={onCancel} className="px-4 py-3 rounded-xl bg-stone-800 text-stone-300 text-sm">やめる</button>
        <button type="button" onClick={save} disabled={saving} className="py-3 rounded-xl bg-amber-600 disabled:bg-stone-700 text-white font-bold">
          {saving ? '保存中…' : '保存する'}
        </button>
      </div>
    </div>
  )
}
