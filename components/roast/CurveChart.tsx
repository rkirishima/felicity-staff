'use client'

import { fmtSec } from '@/lib/roast/profile'

type Pt = { t: number; bt: number | null; et: number | null; ror: number | null }

/**
 * BT / ET（左軸 °C）と RoR（右軸 °C/分）の簡易チャート。
 * 目標の 1ハゼ・ドロップ時刻の幅を薄く塗り、実際の 150°C / 1ハゼ / ドロップに縦線を引く。
 */
export function CurveChart({
  points,
  marks,
  targets,
}: {
  points: Pt[]
  marks: { t: number | null | undefined; label: string; color: string }[]
  targets?: { lo: number; hi: number; label: string }[]
}) {
  if (points.length < 5) {
    return (
      <div className="rounded-lg p-4 text-center text-xs text-stone-500" style={{ backgroundColor: '#1c1917', border: '1px solid #3f3f3f' }}>
        Probat のカーブがまだ届いていません（届くとここにグラフが出ます）
      </div>
    )
  }
  const W = 640
  const H = 260
  const P = { l: 34, r: 30, t: 10, b: 22 }
  const tMax = Math.max(...points.map((p) => p.t), ...(targets ?? []).map((x) => x.hi)) + 10
  const x = (t: number) => P.l + (t / tMax) * (W - P.l - P.r)
  const yT = (v: number) => P.t + (1 - (v - 60) / (240 - 60)) * (H - P.t - P.b)
  const yR = (v: number) => P.t + (1 - Math.max(-5, Math.min(30, v)) / 30) * (H - P.t - P.b)

  const path = (key: 'bt' | 'et' | 'ror', y: (v: number) => number) => {
    let d = ''
    let pen = false
    for (const p of points) {
      const v = p[key]
      if (v == null || (key !== 'ror' && v < 60)) { pen = false; continue }
      if (key === 'ror' && p.t < 45) continue // 投入直後の RoR は意味がない
      d += `${pen ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(v).toFixed(1)}`
      pen = true
    }
    return d
  }

  const minutes = Array.from({ length: Math.floor(tMax / 60) + 1 }, (_, i) => i * 60)

  return (
    <div className="rounded-lg p-2" style={{ backgroundColor: '#1c1917', border: '1px solid #3f3f3f' }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="焙煎カーブ">
        {targets?.map((tg, i) => (
          <g key={i}>
            <rect x={x(tg.lo)} y={P.t} width={Math.max(2, x(tg.hi) - x(tg.lo))} height={H - P.t - P.b} fill="rgba(245,158,11,0.10)" />
            <text x={x(tg.lo) + 2} y={P.t + 10} fontSize="9" fill="#a8a29e">{tg.label}</text>
          </g>
        ))}
        {[100, 150, 200].map((v) => (
          <g key={v}>
            <line x1={P.l} x2={W - P.r} y1={yT(v)} y2={yT(v)} stroke="#292524" />
            <text x={P.l - 4} y={yT(v) + 3} fontSize="9" fill="#78716c" textAnchor="end">{v}</text>
          </g>
        ))}
        {[0, 10, 20].map((v) => (
          <text key={v} x={W - P.r + 4} y={yR(v) + 3} fontSize="9" fill="#65a30d">{v}</text>
        ))}
        {minutes.map((t) => (
          <text key={t} x={x(t)} y={H - 6} fontSize="9" fill="#78716c" textAnchor="middle">{t / 60}</text>
        ))}
        <path d={path('et', yT)} fill="none" stroke="#f472b6" strokeWidth="1.2" opacity="0.7" />
        <path d={path('bt', yT)} fill="none" stroke="#38bdf8" strokeWidth="2" />
        <path d={path('ror', yR)} fill="none" stroke="#a3e635" strokeWidth="1.4" />
        {marks.filter((m) => m.t != null).map((m, i) => (
          <g key={i}>
            <line x1={x(m.t as number)} x2={x(m.t as number)} y1={P.t} y2={H - P.b} stroke={m.color} strokeDasharray="3 3" />
            <text x={x(m.t as number) + 3} y={H - P.b - 4 - i * 11} fontSize="9" fill={m.color}>{m.label} {fmtSec(m.t)}</text>
          </g>
        ))}
      </svg>
      <div className="flex gap-3 justify-center text-[10px] text-stone-500 pb-1">
        <span><span className="text-sky-400">━</span> 豆温度</span>
        <span><span className="text-pink-400">━</span> 排気</span>
        <span><span className="text-lime-400">━</span> RoR（右軸）</span>
        <span><span className="text-amber-400">■</span> 目標の幅</span>
      </div>
    </div>
  )
}
