const SESSION_KEY = 'felicity_session'
const ADMIN_SESSION_KEY = 'felicity_admin_session'
export type Session = { staffId: string; staffName: string; staffRole: string; hourlyRate: number; date: string }
function todayJST() { return new Date(Date.now() + 9*60*60*1000).toISOString().slice(0,10) }
export function saveSession(staff: { id: string; name: string; role: string; hourly_rate?: number }) {
  if (typeof window === 'undefined') return
  const key = staff.role === 'admin' ? ADMIN_SESSION_KEY : SESSION_KEY
  localStorage.setItem(key, JSON.stringify({ staffId: staff.id, staffName: staff.name, staffRole: staff.role, hourlyRate: staff.hourly_rate ?? 1300, date: todayJST() }))
}
export function getSession(): Session | null {
  if (typeof window === 'undefined') return null
  try { const raw = localStorage.getItem(SESSION_KEY); if (!raw) return null; const s: Session = JSON.parse(raw); if (s.date !== todayJST()) { clearSession(); return null }; return s } catch { return null }
}
export function getAdminSession(): Session | null {
  if (typeof window === 'undefined') return null
  try { const raw = localStorage.getItem(ADMIN_SESSION_KEY); if (!raw) return null; const s: Session = JSON.parse(raw); if (s.date !== todayJST()) { localStorage.removeItem(ADMIN_SESSION_KEY); return null }; return s } catch { return null }
}
export function clearSession() { if (typeof window === 'undefined') return; localStorage.removeItem(SESSION_KEY) }
export function clearAdminSession() { if (typeof window === 'undefined') return; localStorage.removeItem(ADMIN_SESSION_KEY) }
