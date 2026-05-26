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
