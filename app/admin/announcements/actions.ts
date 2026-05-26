'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type AnnouncementInput = {
  title: string
  title_en: string | null
  body: string | null
  body_en: string | null
  banner_text: string
  banner_text_en: string | null
  type: 'closure' | 'event' | 'menu' | 'other'
  start_date: string
  end_date: string
  event_date: string | null
  event_start_time: string | null
  event_end_time: string | null
  link_url: string | null
  published: boolean
  priority: number
}

function normalize(input: AnnouncementInput): AnnouncementInput {
  return {
    ...input,
    title_en: input.title_en?.trim() || null,
    body: input.body?.trim() || null,
    body_en: input.body_en?.trim() || null,
    banner_text_en: input.banner_text_en?.trim() || null,
    event_date: input.event_date || null,
    event_start_time: input.event_start_time || null,
    event_end_time: input.event_end_time || null,
    link_url: input.link_url?.trim() || null,
  }
}

export async function createAnnouncement(input: AnnouncementInput, createdBy: string | null): Promise<string> {
  const sb = await createClient()
  const { data, error } = await sb
    .from('announcements')
    .insert({ ...normalize(input), created_by: createdBy })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  revalidatePath('/admin/announcements')
  return data.id as string
}

export async function updateAnnouncement(id: string, input: AnnouncementInput): Promise<void> {
  const sb = await createClient()
  const { error } = await sb
    .from('announcements')
    .update({ ...normalize(input), updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/announcements')
  revalidatePath(`/admin/announcements/${id}`)
}

export async function deleteAnnouncement(id: string): Promise<void> {
  const sb = await createClient()
  const { error } = await sb.from('announcements').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/announcements')
}

export async function togglePublished(id: string, published: boolean): Promise<void> {
  const sb = await createClient()
  const { error } = await sb
    .from('announcements')
    .update({ published, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/announcements')
}

export async function sendTelegramTest(id: string): Promise<{ ok: boolean; message: string }> {
  const sb = await createClient()
  const { data, error } = await sb
    .from('announcements')
    .select('id, title, banner_text, body, event_date, event_start_time, event_end_time, type, link_url')
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return { ok: false, message: error?.message ?? 'not found' }

  const { sendTelegramMessage } = await import('@/lib/telegram')

  const typeEmoji: Record<string, string> = {
    closure: '🏷',
    event: '🎉',
    menu: '☕',
    other: '📌',
  }
  const emoji = typeEmoji[data.type as string] ?? '📢'

  const escapeHtml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  let dateLabel = ''
  let timeLabel = ''
  if (data.event_date) {
    const d = new Date((data.event_date as string) + 'T00:00:00+09:00')
    const day = ['日', '月', '火', '水', '木', '金', '土'][d.getUTCDay()]
    dateLabel = `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${day})`
    if (data.event_start_time && data.event_end_time) {
      timeLabel = ` ${(data.event_start_time as string).slice(0, 5)}〜${(data.event_end_time as string).slice(0, 5)}`
    }
  }
  const editUrl = `https://staff.felicity.cafe/admin/announcements/${id}`

  const lines = [
    `${emoji} <b>[テスト送信] 1週間前リマインダー</b>`,
    '',
    `<b>${escapeHtml(data.title as string)}</b>`,
  ]
  if (dateLabel) lines.push(`📅 ${escapeHtml(dateLabel)}${escapeHtml(timeLabel)}`)
  lines.push('', escapeHtml(data.banner_text as string))
  if (data.body) lines.push('', escapeHtml(data.body as string))
  lines.push('', `<a href="${editUrl}">▶ 編集ページを開く</a>`)

  const result = await sendTelegramMessage({
    text: lines.join('\n'),
    parseMode: 'HTML',
    disablePreview: true,
  })
  if (result.ok) {
    return { ok: true, message: result.skipped ? 'env未設定でスキップ' : '送信しました' }
  }
  return { ok: false, message: result.error }
}
