'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Thermometer, AlertTriangle, Flame, Wind, RotateCw } from 'lucide-react'

export type UseCase = 'drip' | 'espresso' | 'omni'

type Profile = {
  bean_id: string
  bean_name: string
  batch_kg: number
  roast_level: string | null
  use_case: string | null
  charge_temp_c: number | null
  drum_pct: number | null
  gas_charge_pct: number | null
  gas_dry_end_pct: number | null
  gas_fc_pct: number | null
  gas_drop_pct: number | null
  fan_charge_pct: number | null
  fan_fc_pct: number | null
  fan_drop_pct: number | null
  dry_end: string | null
  dry_end_temp_c: number | null
  fc_target: string | null
  fc_temp_c: number | null
  drop_target: string | null
  drop_temp_c: number | null
  dtr_pct: string | null
  weight_loss_pct: string | null
  ror_drop_min: number | null
  gas_plan: string | null
  watchouts: string | null
  evidence: string | null
  confidence: 'measured' | 'thin' | 'trial' | 'estimated'
  confidence_rank: number
}

const CONF: Record<Profile['confidence'], { label: string; text: string; bg: string }> = {
  measured:  { label: '実測ベース', text: '#5eead4', bg: 'rgba(20,184,166,0.14)' },
  thin:      { label: '実測(僅少)', text: '#7dd3fc', bg: 'rgba(56,189,248,0.14)' },
  trial:     { label: 'トライアル', text: '#fcd34d', bg: 'rgba(245,158,11,0.14)' },
  estimated: { label: '旧推定値',   text: '#a8a29e', bg: 'rgba(168,162,158,0.12)' },
}

/** 実測本数を evidence 文から拾う（「…合格した8本の中央値」） */
function sampleCount(ev: string | null): number | null {
  const m = ev?.match(/合格した(\d+)本/)
  return m ? Number(m[1]) : null
}

function Cell({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="bg-stone-900 rounded p-2 text-center">
      <p className="text-[10px] text-stone-500">{label}</p>
      <p className={`text-base font-bold ${accent ? 'text-amber-400' : 'text-white'}`}>{value}</p>
      {sub && <p className="text-[9px] text-stone-600">{sub}</p>}
    </div>
  )
}

export function RoastProfileCard({
  beanId, greenKg, useCase,
}: { beanId: string; greenKg: number; useCase: UseCase }) {
  const supabase = createClient()
  const [rows, setRows] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!beanId) { setRows([]); setLoading(false); return }
    const { data } = await supabase
      .from('roast_profile_recommended')
      .select('*')
      .eq('bean_id', beanId)
      .order('confidence_rank')
    setRows((data as Profile[]) ?? [])
    setLoading(false)
  }, [supabase, beanId])

  // load() は async で、setState は必ず await 後に走る。
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  if (!beanId) return null
  if (loading) return <div className="rounded-lg p-3 text-xs text-stone-500" style={{ backgroundColor: '#1c1917', border: '1px solid #3f3f3f' }}>プロファイル検索中...</div>

  // 用途が一致するものがあればそれだけ。無ければ全件から信頼度順で選ぶ
  // （omni だけに絞ると、数値のある実測ドリップより数値の無い旧推定omniが
  //   勝ってしまう）。用途が違う場合は下に警告を出す。
  const byUse = rows.filter((r) => r.use_case === useCase)
  const pool = byUse.length ? byUse : rows

  // 信頼度を最優先する。バッチサイズが近いことより、その数字が実際の焙煎から
  // 出ていることのほうが大事（旧推定にはガス・ファンの数値が無い）。
  // バッチが違う場合は下に警告を出すので、黙って使われることはない。
  const p = [...pool].sort((a, b) =>
    a.confidence_rank - b.confidence_rank
    || Math.abs(a.batch_kg - greenKg) - Math.abs(b.batch_kg - greenKg)
  )[0]

  if (!p) return (
    <div className="rounded-lg p-3 text-xs text-stone-400" style={{ backgroundColor: '#1c1917', border: '1px solid #3f3f3f' }}>
      この豆のプロファイルは未登録です。経験値で焙煎して、結果を残してください。
    </div>
  )

  const conf = CONF[p.confidence]
  const n = sampleCount(p.evidence)
  const batchMismatch = Math.abs(p.batch_kg - greenKg) >= 0.5
  const useMismatch = p.use_case !== useCase

  const gas = [p.gas_charge_pct, p.gas_dry_end_pct, p.gas_fc_pct, p.gas_drop_pct]
  const fan = [p.fan_charge_pct, p.fan_fc_pct, p.fan_drop_pct]
  const hasGas = gas.some((v) => v != null)
  const hasFan = fan.some((v) => v != null)

  return (
    <div className="rounded-lg p-3 space-y-2.5" style={{ backgroundColor: '#1c1917', border: '1px solid #44403c' }}>
      <div className="flex items-center gap-2 text-xs">
        <Thermometer size={14} className="text-amber-400" />
        <span className="font-semibold tracking-wider text-amber-400">推奨プロファイル</span>
        <span className="px-1.5 py-0.5 rounded text-[10px]" style={{ color: conf.text, backgroundColor: conf.bg }}>
          {conf.label}{n ? ` ${n}本` : ''}
        </span>
        <span className="ml-auto text-[10px] text-stone-500">
          {p.batch_kg}kg / {p.use_case === 'espresso' ? 'エスプレッソ' : p.use_case === 'drip' ? 'ドリップ' : 'オムニ'}
        </span>
      </div>

      {(batchMismatch || useMismatch) && (
        <p className="text-[10px] text-amber-300/80 leading-relaxed">
          {batchMismatch && `※ ${p.batch_kg}kg のデータです（今回 ${greenKg}kg）。バッチが違うと投入温度と時間はずれます。`}
          {useMismatch && ` ※ ${p.use_case} 用のプロファイルを流用表示しています。`}
        </p>
      )}

      <div className="grid grid-cols-4 gap-2">
        <Cell label="CHARGE" value={p.charge_temp_c ? `${p.charge_temp_c}°` : '—'} sub="投入時BT" />
        <Cell label="1ハゼ" value={p.fc_temp_c ? `${p.fc_temp_c}°` : '—'} sub={p.fc_target ?? undefined} />
        <Cell label="DROP" value={p.drop_temp_c ? `${p.drop_temp_c}°` : '—'} sub={p.drop_target ?? undefined} accent />
        <Cell label="DTR" value={p.dtr_pct ? `${p.dtr_pct}%` : '—'} sub={p.weight_loss_pct ? `歩留 ${p.weight_loss_pct}%` : undefined} />
      </div>

      {hasGas || hasFan || p.drum_pct != null ? (
        <div className="grid grid-cols-3 gap-2 text-[11px]">
          <div className="rounded px-2 py-1.5 flex items-center gap-1.5" style={{ backgroundColor: '#292524' }}>
            <Flame size={12} className="text-orange-400 shrink-0" />
            <span className="text-stone-300 tabular-nums">
              {hasGas ? gas.map((v) => v ?? '?').join('→') : <span className="text-stone-600">記録なし</span>}
            </span>
          </div>
          <div className="rounded px-2 py-1.5 flex items-center gap-1.5" style={{ backgroundColor: '#292524' }}>
            <Wind size={12} className="text-sky-400 shrink-0" />
            <span className="text-stone-300 tabular-nums">
              {hasFan ? fan.map((v) => v ?? '?').join('→') : <span className="text-stone-600">記録なし</span>}
            </span>
          </div>
          <div className="rounded px-2 py-1.5 flex items-center gap-1.5" style={{ backgroundColor: '#292524' }}>
            <RotateCw size={12} className="text-stone-400 shrink-0" />
            <span className="text-stone-300 tabular-nums">
              {p.drum_pct != null ? `ドラム ${p.drum_pct}` : <span className="text-stone-600">ドラム 記録なし</span>}
            </span>
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-amber-300/80 leading-relaxed">
          この豆はまだ実測データが無く、ガス・ファン・ドラムの数値がありません。
          下の文章を目安にして、焼いた結果を記録してください（次回から実測値が出ます）。
        </p>
      )}

      <div className="text-[11px] text-stone-500 flex gap-3">
        <span>ドライエンド {p.dry_end ?? '—'}{p.dry_end_temp_c ? ` / ${p.dry_end_temp_c}°` : ''}</span>
        {p.ror_drop_min != null && <span>ドロップ時RoR ≧{p.ror_drop_min}</span>}
      </div>

      {p.gas_plan && (
        <p className="text-xs text-stone-300 leading-relaxed">{p.gas_plan}</p>
      )}

      {p.watchouts && (
        <div className="text-[11px] text-stone-400 leading-relaxed border-l-2 border-rose-800 pl-2">
          <AlertTriangle size={11} className="inline text-rose-400 mr-1" />
          {p.watchouts}
        </div>
      )}

      {p.evidence && (
        <p className="text-[10px] text-stone-600 leading-relaxed">{p.evidence}</p>
      )}
    </div>
  )
}
