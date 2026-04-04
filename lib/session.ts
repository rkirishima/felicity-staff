const SESSION_KEY = 'felicity_session'

export type Session = {
  staffId: string
  staffName: string
  staffRole: string
  hourlyRate: number
  date: string
}

function todayJST() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export function saveSession(staff: { id: string; name: string; role: string; hourly_rate: number }) {
  if (typeof window === 'undefined') return
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    staffId: staff.id,
    staffName: staff.name,
    staffRole: staff.role,
    hourlyRate: staff.hourly_rate,
    date: todayJST(),
  }))
}

export function getSession(): Session | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const session: Session = JSON.parse(raw)
    if (session.date !== todayJST()) { clearSession(); return null }
    return session
  } catch { return null }
}

export function clearSession() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(SESSION_KEY)
}
