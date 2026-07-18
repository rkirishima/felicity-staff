// 経理画面共通のデータ取得エラー表示。会計画面では取得失敗を握り潰して ¥0 と
// 表示するのは危険（過少計上に見える）なため、失敗時は必ずこの帯を出す。
export function LoadError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-2.5 text-xs text-red-700">
      ⚠️ データの取得に失敗しました。表示中の金額は不正確な可能性があります。
      <span className="block mt-0.5 text-red-500/80 break-all">{message}</span>
    </div>
  )
}
