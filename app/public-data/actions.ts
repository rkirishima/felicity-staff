'use server'

// ログイン前の画面で必要な、公開しても差し支えない情報だけを返す。
// DB には RLS がかかり公開キーでは読めないので、ここで service role を使い
// 必要な列だけに絞って渡す（時給・PIN などは返さない）。
import { createAdminClient } from '@/lib/supabase/admin'
import { loadShiftDeadlineSettings, type ShiftDeadlineSettings } from '@/lib/shifts/deadline'

export type PublicStaff = { id: string; name: string; role: string }

/** 打刻・シフト画面の名前選択用。 */
export async function listActiveStaff(): Promise<PublicStaff[]> {
  const sb = createAdminClient()
  const { data } = await sb.from('staff').select('id, name, role').eq('active', true).order('name')
  return (data ?? []) as PublicStaff[]
}

export type ScheduleMonth = {
  specialDays: string[]
  templates: { id: string; name: string; day_type: string; start_time: string; end_time: string }[]
  shifts: { id: string; staff_id: string | null; date: string; start_time: string; end_time: string; status: string; location: string | null; note: string | null; staff: { name: string } }[]
  deadlineSettings: ShiftDeadlineSettings
}

/** シフト表（月）。ログイン前でも閲覧できる従来の挙動を保つ。 */
export async function getScheduleMonth(year: number, month: number): Promise<ScheduleMonth> {
  const sb = createAdminClient()
  const m = String(month).padStart(2, '0')
  const lastDay = new Date(year, month, 0).getDate()
  const [special, templates, shifts, staff, deadlineSettings] = await Promise.all([
    sb.from('special_business_days').select('date, day_type'),
    sb.from('shift_templates').select('id, name, day_type, start_time, end_time').order('day_type'),
    sb.from('shifts').select('id, staff_id, date, start_time, end_time, status, location, note')
      .gte('date', `${year}-${m}-01`)
      .lte('date', `${year}-${m}-${lastDay}`)
      .in('status', ['approved', 'pending']),
    sb.from('staff').select('id, name'),
    loadShiftDeadlineSettings(sb),
  ])
  const nameOf: Record<string, string> = {}
  for (const s of staff.data ?? []) nameOf[s.id as string] = s.name as string
  return {
    specialDays: (special.data ?? []).filter((d) => d.day_type === 'weekend').map((d) => d.date as string),
    templates: (templates.data ?? []) as ScheduleMonth['templates'],
    shifts: (shifts.data ?? []).map((sh) => ({ ...sh, staff: { name: nameOf[sh.staff_id as string] ?? '' } })) as ScheduleMonth['shifts'],
    deadlineSettings,
  }
}
