# felicity-web 告知バナー実装指示書

felicity-staff 側で管理する告知（貸切・イベント等）を、お客様向け web サイト felicity-web で表示するための実装ガイド。

## 全体像

```
+----------------------+         +----------------------+
| felicity-staff       |         | felicity-web         |
| /admin/announcements |  ───>   | <SiteNoticeBanner /> |
| (CRUD)               |  fetch  | (top of layout)      |
+----------------------+         +----------------------+
            │
            ▼
+----------------------+
| GET /api/            |
| announcements/active |
| (public, CORS *)     |
+----------------------+
```

## 1. API レスポンス形式

エンドポイント:
```
GET https://staff.felicity.cafe/api/announcements/active
```

CORS は `*` 許可、60秒 Edge キャッシュ。レスポンス:
```json
{
  "count": 1,
  "asOf": "2026-05-26T12:34:56.000Z",
  "announcements": [
    {
      "id": "uuid",
      "title": "貸切営業のお知らせ",
      "title_en": "Private Event Notice",
      "body": "2026年7月2日（木）は朝7時から14時まで...",
      "body_en": "We will be closed for a private event...",
      "banner_text": "7/2(木) 7:00〜14:00 貸切のため一般営業休止",
      "banner_text_en": "Closed for private event 7:00–14:00 on Jul 2 (Thu)",
      "type": "closure",
      "event_date": "2026-07-02",
      "event_start_time": "07:00:00",
      "event_end_time": "14:00:00",
      "link_url": null,
      "priority": 100
    }
  ]
}
```

掲載期間（`start_date <= today <= end_date`）の中の `published=true` のみが返ります。`priority` 降順 → `start_date` 降順でソート済み。

## 2. felicity-web 側に追加するコンポーネント

新規ファイル: `components/SiteNoticeBanner.tsx`

```tsx
'use client'
import { useEffect, useState } from 'react'

type Announcement = {
  id: string
  title: string
  title_en: string | null
  body: string | null
  body_en: string | null
  banner_text: string
  banner_text_en: string | null
  type: 'closure' | 'event' | 'menu' | 'other'
  event_date: string | null
  event_start_time: string | null
  event_end_time: string | null
  link_url: string | null
  priority: number
}

const STAFF_API = 'https://staff.felicity.cafe/api/announcements/active'

export function SiteNoticeBanner({ lang = 'ja' }: { lang?: 'ja' | 'en' }) {
  const [notices, setNotices] = useState<Announcement[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch(STAFF_API, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => setNotices(d?.announcements ?? []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    const stored = sessionStorage.getItem('felicity-notice-dismissed')
    if (stored) setDismissed(new Set(JSON.parse(stored)))
  }, [])

  function dismiss(id: string) {
    const next = new Set(dismissed)
    next.add(id)
    setDismissed(next)
    sessionStorage.setItem('felicity-notice-dismissed', JSON.stringify([...next]))
  }

  const visible = notices.filter(n => !dismissed.has(n.id))
  if (visible.length === 0) return null

  const TYPE_BG: Record<string, string> = {
    closure: 'bg-amber-50 border-amber-300 text-amber-900',
    event: 'bg-emerald-50 border-emerald-300 text-emerald-900',
    menu: 'bg-blue-50 border-blue-300 text-blue-900',
    other: 'bg-stone-50 border-stone-300 text-stone-900',
  }

  return (
    <div className="w-full">
      {visible.map(n => {
        const text = lang === 'en' ? (n.banner_text_en || n.banner_text) : n.banner_text
        const colors = TYPE_BG[n.type] ?? TYPE_BG.other
        return (
          <div
            key={n.id}
            className={`${colors} border-b px-4 py-2 text-sm text-center relative`}
          >
            {n.link_url ? (
              <a href={n.link_url} className="underline">{text}</a>
            ) : (
              <span>{text}</span>
            )}
            <button
              onClick={() => dismiss(n.id)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-700 text-lg leading-none"
              aria-label="閉じる"
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}
```

## 3. 設置場所

`app/layout.tsx` の最上部（ヘッダーの上）に挿入：

```tsx
import { SiteNoticeBanner } from '@/components/SiteNoticeBanner'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <SiteNoticeBanner lang="ja" />
        <Header />
        {children}
        <Footer />
      </body>
    </html>
  )
}
```

英語ページがある場合は `lang="en"` を渡す。

## 4. 詳細ページ（任意）

複数告知や本文（`body`）も含めて表示したい場合は `app/notice/page.tsx` を作成：

```tsx
async function getAnnouncements() {
  const res = await fetch('https://staff.felicity.cafe/api/announcements/active', {
    next: { revalidate: 60 }
  })
  if (!res.ok) return []
  const data = await res.json()
  return data.announcements ?? []
}

export default async function NoticePage() {
  const notices = await getAnnouncements()
  return (
    <main className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold mb-6">お知らせ</h1>
      {notices.length === 0 ? (
        <p>現在お知らせはありません。</p>
      ) : (
        <ul className="space-y-6">
          {notices.map((n: any) => (
            <li key={n.id} className="border-b pb-6">
              <h2 className="text-lg font-medium">{n.title}</h2>
              {n.event_date && (
                <p className="text-sm text-stone-500 mt-1">
                  {n.event_date}
                  {n.event_start_time && n.event_end_time && (
                    ` ${n.event_start_time.slice(0, 5)}〜${n.event_end_time.slice(0, 5)}`
                  )}
                </p>
              )}
              {n.body && <p className="mt-3 whitespace-pre-wrap">{n.body}</p>}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
```

## 5. 動作確認

1. felicity-staff `/admin/announcements` で新規告知を作成（`published=true`、掲載期間に今日を含む）
2. felicity-web の トップページにアクセス → バナーが上部に表示されるはず
3. × ボタンで一時的に閉じる（セッション中のみ）
4. 期間外になれば自動で消える

## 注意

- CORS は `*` 許可なので特別な設定不要
- felicity-staff 側で告知を更新したら最大 **60 秒で web にも反映**（Edge キャッシュ）
- felicity-staff が落ちている時は `catch(() => {})` で何も表示しないので、サイト自体は壊れない

実装は Mac mini 側で felicity-web リポジトリに上記コードをコピペすれば完了です。
