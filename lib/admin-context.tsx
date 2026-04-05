'use client'
import { createContext, useContext, useState, useEffect } from 'react'

const AdminContext = createContext(false)

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const [isAdmin, setIsAdmin] = useState(false)
  useEffect(() => {
    function check() {
      try {
        const raw = localStorage.getItem('felicity_admin_session')
        if (!raw) return setIsAdmin(false)
        const s = JSON.parse(raw)
        const today = new Date(Date.now() + 9*60*60*1000).toISOString().slice(0,10)
        setIsAdmin(s.date === today)
      } catch { setIsAdmin(false) }
    }
    check()
    window.addEventListener('storage', check)
    window.addEventListener('admin-session-changed', check)
    return () => {
      window.removeEventListener('storage', check)
      window.removeEventListener('admin-session-changed', check)
    }
  }, [])
  return <AdminContext.Provider value={isAdmin}>{children}</AdminContext.Provider>
}

export function useIsAdmin() { return useContext(AdminContext) }
