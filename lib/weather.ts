// Open-Meteo（APIキー不要）で、指定日・指定座標・指定時間帯の降水を判定する。
// 2日先程度の予報は十分カバー範囲内（最大16日先まで）。

export type RainCheck = {
  willRain: boolean
  maxPop: number // 対象時間帯の最大降水確率(%)
  totalMm: number // 対象時間帯の合計降水量(mm)
  hours: Array<{ hour: number; pop: number; mm: number }>
}

export async function checkRain(opts: {
  latitude: number
  longitude: number
  date: string // 'YYYY-MM-DD'（JST基準）
  startHour?: number // 既定 11
  endHour?: number // 既定 16（この時刻も含む）
  popThreshold?: number // 既定 50(%)
  mmThreshold?: number // 既定 1(mm・時間帯合計)
}): Promise<RainCheck | null> {
  const {
    latitude, longitude, date,
    startHour = 11, endHour = 16,
    popThreshold = 50, mmThreshold = 1,
  } = opts

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
    `&hourly=precipitation,precipitation_probability&timezone=Asia%2FTokyo` +
    `&start_date=${date}&end_date=${date}`

  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const json = await res.json()
    const times: string[] = json?.hourly?.time ?? []
    const pops: number[] = json?.hourly?.precipitation_probability ?? []
    const mms: number[] = json?.hourly?.precipitation ?? []

    const hours: Array<{ hour: number; pop: number; mm: number }> = []
    for (let i = 0; i < times.length; i++) {
      const hour = Number(times[i].slice(11, 13)) // 'YYYY-MM-DDTHH:mm'
      if (hour >= startHour && hour <= endHour) {
        hours.push({ hour, pop: Number(pops[i] ?? 0), mm: Number(mms[i] ?? 0) })
      }
    }
    if (hours.length === 0) return null

    const maxPop = Math.max(...hours.map(h => h.pop))
    const totalMm = Math.round(hours.reduce((a, h) => a + h.mm, 0) * 10) / 10
    const willRain = maxPop >= popThreshold || totalMm >= mmThreshold
    return { willRain, maxPop, totalMm, hours }
  } catch {
    return null
  }
}
