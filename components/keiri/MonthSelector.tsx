'use client'

function shift(month: string, delta: number): string {
  const [y, m] = month.split('-').map(s => parseInt(s, 10))
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function format(month: string): string {
  const [y, m] = month.split('-').map(s => parseInt(s, 10))
  return `${y}年${m}月`
}

export function MonthSelector({
  value,
  onChange,
  className = '',
}: {
  value: string
  onChange: (month: string) => void
  className?: string
}) {
  return (
    <div className={`flex items-center justify-between bg-white rounded-2xl shadow-sm border border-stone-100 px-2 py-1 ${className}`}>
      <button
        type="button"
        onClick={() => onChange(shift(value, -1))}
        className="text-stone-400 px-3 py-1 hover:text-stone-700"
        aria-label="前の月"
      >
        ←
      </button>
      <p className="text-sm font-medium text-stone-700 tabular-nums tracking-wider">
        {format(value)}
      </p>
      <button
        type="button"
        onClick={() => onChange(shift(value, 1))}
        className="text-stone-400 px-3 py-1 hover:text-stone-700"
        aria-label="次の月"
      >
        →
      </button>
    </div>
  )
}
