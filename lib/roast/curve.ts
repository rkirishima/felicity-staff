// Probat のカーブ（roast_curves.samples / events / metrics）を読みやすい要約に変換する。
// AI に生データを渡すと数字の読み違いが起きるので、判定（クラッシュ・フリック・
// 1ハゼ前のRoR上昇など）はここでコードとして先に済ませ、AI には「解釈と次の一手」だけ任せる。

export type CurveSample = {
  t: number
  bt: number | null
  et: number | null
  ror: number | null
  gas: number | null
  air: number | null
  drum: number | null
}

export type CurveEvent = { e: string; t: number; bt: number | null }

export type CurveMetrics = {
  fc_start_s?: number | null
  total_time_s?: number | null
  dev_time_s?: number | null
  dtr_pct?: number | null
  turning_point_c?: number | null
  turning_point_s?: number | null
  color_change_s?: number | null
  charge_temp_c?: number | null
  is_test_roast?: boolean
}

export type CurveRow = {
  id: string
  samples: CurveSample[] | null
  events: CurveEvent[] | null
  metrics: CurveMetrics | null
  total_time_s: number | null
  fc_start_s: number | null
}

export type ControlChange = { t: number; what: 'gas' | 'air' | 'drum'; value: number }

export type CurveDigest = {
  tp_s: number | null
  tp_c: number | null
  dry_end_s: number | null // BT 150°C 到達
  t175_s: number | null // BT 175°C 到達
  fc_s: number | null
  fc_c: number | null
  drop_s: number | null
  drop_c: number | null // ドロップ直前の最高BT（記録上のdrop_tempは排出後の値なので使わない）
  dev_s: number | null
  dtr_pct: number | null
  maillard_s: number | null // 150°C → 1ハゼ
  ror_at: { t: number; ror: number }[] // 30秒ごと
  ror_peak: number | null
  ror_at_fc: number | null
  ror_at_drop: number | null
  controls: ControlChange[]
  flags: RoastFlag[]
}

export type RoastFlag = {
  code:
    | 'crash_after_fc'
    | 'flick_before_drop'
    | 'ror_rise_into_fc'
    | 'flat_ror_before_fc'
    | 'high_ror_at_drop'
    | 'low_turning_point'
    | 'fast_front'
    | 'short_maillard'
    | 'long_maillard'
    | 'no_curve'
  severity: 'info' | 'warn' | 'bad'
  message: string
}

function nearest(samples: CurveSample[], t: number, key: 'bt' | 'ror'): number | null {
  let best: number | null = null
  let bestD = Infinity
  for (const s of samples) {
    const v = s[key]
    if (v == null) continue
    const d = Math.abs(s.t - t)
    if (d < bestD) { bestD = d; best = v }
    if (s.t > t && d > bestD) break
  }
  return bestD <= 10 ? best : null
}

function firstReach(samples: CurveSample[], temp: number, after: number): number | null {
  for (const s of samples) {
    if (s.t < after || s.bt == null) continue
    if (s.bt >= temp) return s.t
  }
  return null
}

function r1(n: number | null): number | null {
  return n == null ? null : Math.round(n * 10) / 10
}

export function digestCurve(curve: CurveRow, target?: { rorDropMax?: number | null }): CurveDigest {
  const samples = (curve.samples ?? []).filter((s) => typeof s?.t === 'number').sort((a, b) => a.t - b.t)
  const events = curve.events ?? []
  const m = curve.metrics ?? {}

  const fc = m.fc_start_s ?? curve.fc_start_s ?? events.find((e) => e.e === 'firstCrackBeginningEvent')?.t ?? null
  // 排出の瞬間: 最後の fill/clear イベント > metrics.total_time_s
  const endEvent = [...events].reverse().find((e) => e.e === 'clearEvent' || (e.e === 'fillEvent' && e.t > 60))
  const total = endEvent?.t ?? m.total_time_s ?? curve.total_time_s ?? null

  // ターニングポイント: 最初の2.5分の最低BT
  let tp_s: number | null = m.turning_point_s ?? null
  let tp_c: number | null = m.turning_point_c ?? null
  if (tp_c == null) {
    for (const s of samples) {
      if (s.t > 150) break
      if (s.t < 10 || s.bt == null) continue
      if (tp_c == null || s.bt < tp_c) { tp_c = s.bt; tp_s = s.t }
    }
  }

  const after = tp_s ?? 30
  const dry_end_s = firstReach(samples, 150, after)
  const t175_s = firstReach(samples, 175, after)

  // ドロップ温度は排出直前15秒の最高BT
  let drop_c: number | null = null
  if (total != null) {
    for (const s of samples) {
      if (s.t < total - 15 || s.t > total) continue
      if (s.bt != null && (drop_c == null || s.bt > drop_c)) drop_c = s.bt
    }
  }

  const ror_at: { t: number; ror: number }[] = []
  const end = total ?? samples[samples.length - 1]?.t ?? 0
  for (let t = 60; t <= end; t += 30) {
    const r = nearest(samples, t, 'ror')
    if (r != null) ror_at.push({ t, ror: Math.round(r * 10) / 10 })
  }
  const rorAfterTp = ror_at.filter((x) => x.t >= (tp_s ?? 60) + 30)
  const ror_peak = rorAfterTp.length ? Math.max(...rorAfterTp.map((x) => x.ror)) : null
  const ror_at_fc = fc != null ? nearest(samples, fc, 'ror') : null
  const ror_at_drop = total != null ? nearest(samples, total - 3, 'ror') : null

  // 操作の変化点（gas / air / drum が記録された行だけ）
  const controls: ControlChange[] = []
  const last: Record<string, number | null> = { gas: null, air: null, drum: null }
  for (const s of samples) {
    for (const k of ['gas', 'air', 'drum'] as const) {
      const v = s[k]
      if (v == null || v === last[k]) continue
      last[k] = v
      controls.push({ t: s.t, what: k, value: v })
    }
  }

  const dev_s = fc != null && total != null ? total - fc : null
  const dtr_pct = dev_s != null && total ? Math.round((dev_s / total) * 1000) / 10 : null
  const maillard_s = fc != null && dry_end_s != null ? fc - dry_end_s : null

  // ── 判定 ──
  const flags: RoastFlag[] = []
  if (samples.length < 30) {
    flags.push({ code: 'no_curve', severity: 'info', message: 'カーブが無い/少ないため、手入力の時刻だけで判定' })
  }
  if (fc != null && ror_at_fc != null) {
    const win = samples.filter((s) => s.t > fc && s.t <= fc + 60 && s.ror != null).map((s) => s.ror as number)
    const minAfter = win.length ? Math.min(...win) : null
    if (minAfter != null && ror_at_fc - minAfter >= 5) {
      flags.push({ code: 'crash_after_fc', severity: minAfter <= 2 ? 'bad' : 'warn', message: `1ハゼ後60秒でRoRが ${r1(ror_at_fc)} → ${r1(minAfter)} に急落（クラッシュ）` })
    }
    const before = nearest(samples, fc - 90, 'ror')
    if (before != null && ror_at_fc - before >= 1.5) {
      flags.push({ code: 'ror_rise_into_fc', severity: 'warn', message: `1ハゼ前90秒でRoRが ${r1(before)} → ${r1(ror_at_fc)} に上昇（勢いをつけたまま1ハゼ）` })
    } else if (before != null && Math.abs(ror_at_fc - before) < 0.8 && fc - (dry_end_s ?? fc) > 150) {
      flags.push({ code: 'flat_ror_before_fc', severity: 'info', message: `1ハゼ前90秒のRoRがほぼ横ばい（${r1(before)} → ${r1(ror_at_fc)}）` })
    }
  }
  if (fc != null && total != null && total - fc > 60) {
    const tail = samples.filter((s) => s.t >= fc + 30 && s.t <= total - 2 && s.ror != null)
    let lowest = Infinity
    let rise = 0
    for (const s of tail) {
      const r = s.ror as number
      if (r < lowest) lowest = r
      rise = Math.max(rise, r - lowest)
    }
    if (rise >= 2) {
      flags.push({ code: 'flick_before_drop', severity: rise >= 4 ? 'bad' : 'warn', message: `1ハゼ後にRoRが下げ止まってから +${r1(rise)} 再上昇（フリック）` })
    }
  }
  const rorMax = target?.rorDropMax ?? 6
  if (ror_at_drop != null && ror_at_drop > rorMax + 2) {
    flags.push({ code: 'high_ror_at_drop', severity: 'warn', message: `ドロップ時のRoRが ${r1(ror_at_drop)}（目安 ${rorMax} 前後）。勢いが残ったまま排出` })
  }
  if (tp_c != null && tp_c < 85) {
    flags.push({ code: 'low_turning_point', severity: 'info', message: `ボトムが ${r1(tp_c)}°C と低い（前半が遅れやすい）` })
  }
  if (dry_end_s != null && dry_end_s < 240) {
    flags.push({ code: 'fast_front', severity: 'info', message: `150°C 到達が ${Math.floor(dry_end_s / 60)}:${String(dry_end_s % 60).padStart(2, '0')} と速い（この窯は前半が走りやすい）` })
  }
  if (maillard_s != null && total) {
    const share = maillard_s / total
    if (share < 0.25) flags.push({ code: 'short_maillard', severity: 'info', message: `150°C→1ハゼが ${Math.round(share * 100)}%（短め＝酸・フレーバー寄り）` })
    if (share > 0.42) flags.push({ code: 'long_maillard', severity: 'info', message: `150°C→1ハゼが ${Math.round(share * 100)}%（長め＝甘さ・ボディ寄り、平板化に注意）` })
  }

  return {
    tp_s, tp_c: r1(tp_c), dry_end_s, t175_s,
    fc_s: fc, fc_c: fc != null ? r1(nearest(samples, fc, 'bt')) : null,
    drop_s: total, drop_c: r1(drop_c),
    dev_s, dtr_pct, maillard_s,
    ror_at, ror_peak: r1(ror_peak), ror_at_fc: r1(ror_at_fc), ror_at_drop: r1(ror_at_drop),
    controls, flags,
  }
}

/** 手入力の時刻（タイマーのタップ）だけから作る簡易要約 */
export function digestFromEvents(ev: { dry_end_s?: number | null; fc_s?: number | null; drop_s?: number | null }): Partial<CurveDigest> {
  const dev_s = ev.fc_s != null && ev.drop_s != null ? ev.drop_s - ev.fc_s : null
  return {
    dry_end_s: ev.dry_end_s ?? null,
    fc_s: ev.fc_s ?? null,
    drop_s: ev.drop_s ?? null,
    dev_s,
    dtr_pct: dev_s != null && ev.drop_s ? Math.round((dev_s / ev.drop_s) * 1000) / 10 : null,
    maillard_s: ev.fc_s != null && ev.dry_end_s != null ? ev.fc_s - ev.dry_end_s : null,
  }
}

/** グラフ用に 5 秒間隔へ間引く */
export function downsample(samples: CurveSample[] | null, step = 5): { t: number; bt: number | null; et: number | null; ror: number | null }[] {
  if (!samples) return []
  const out: { t: number; bt: number | null; et: number | null; ror: number | null }[] = []
  const sorted = [...samples].sort((a, b) => a.t - b.t)
  let next = 0
  let lastBt: number | null = null
  let lastEt: number | null = null
  for (const s of sorted) {
    if (s.bt != null) lastBt = s.bt
    if (s.et != null) lastEt = s.et
    if (s.t >= next) {
      out.push({ t: s.t, bt: lastBt, et: lastEt, ror: s.ror })
      next = s.t + step
    }
  }
  return out
}
