import { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext(null)

// Two roles only: employee and admin.
export const ROLES = {
  employee: { label: 'Employee' },
  admin:    { label: 'Admin' },
}

// Seed accounts. While there's no backend, users live in localStorage so
// admin-created accounts survive a reload. Move to the Apps Script USERS
// property (shared, server-side) when the backend is wired up.
const SEED_USERS = [
  { id: 1, name: 'Claire', username: 'admin', password: 'admin123', role: 'admin' },
  { id: 2, name: 'Demo Employee', username: 'demo', password: 'demo123', role: 'employee' },
]

const USERS_KEY = 'leave_users'
const SESSION_KEY = 'leave_session'
const IDLE_MS = 12 * 60 * 60 * 1000 // 12 hours of inactivity

function loadUsers() {
  try {
    const raw = localStorage.getItem(USERS_KEY)
    if (raw) {
      const list = JSON.parse(raw)
      if (Array.isArray(list) && list.length) return list
    }
  } catch (e) { /* ignore */ }
  return SEED_USERS
}

function loadSession(users) {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw)
    if (!s.user || !s.expiresAt || Date.now() > s.expiresAt) {
      localStorage.removeItem(SESSION_KEY)
      return null
    }
    // Re-resolve against the current user list so role changes take effect.
    const fresh = users.find(u => u.id === s.user.id)
    return fresh || s.user
  } catch (e) { return null }
}

export function AuthProvider({ children }) {
  const [users, setUsers] = useState(loadUsers)
  const [user, setUser] = useState(() => loadSession(loadUsers()))

  // Persist the user list locally whenever it changes.
  useEffect(() => {
    localStorage.setItem(USERS_KEY, JSON.stringify(users))
  }, [users])

  const writeSession = (u) => {
    if (!u) { localStorage.removeItem(SESSION_KEY); return }
    const safe = { id: u.id, name: u.name, username: u.username, role: u.role }
    localStorage.setItem(SESSION_KEY, JSON.stringify({ user: safe, expiresAt: Date.now() + IDLE_MS }))
  }

  // Keep the session alive while active; auto sign-out after 12h idle.
  useEffect(() => {
    if (!user) return
    let last = 0
    const bump = () => {
      const now = Date.now()
      if (now - last > 30000) { last = now; writeSession(user) }
    }
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll']
    events.forEach(e => window.addEventListener(e, bump, { passive: true }))

    const check = setInterval(() => {
      const raw = localStorage.getItem(SESSION_KEY)
      if (!raw) { setUser(null); return }
      try {
        const s = JSON.parse(raw)
        if (Date.now() > s.expiresAt) { localStorage.removeItem(SESSION_KEY); setUser(null) }
      } catch (e) { /* ignore */ }
    }, 60000)

    return () => {
      events.forEach(e => window.removeEventListener(e, bump))
      clearInterval(check)
    }
  }, [user])

  const login = (username, password) => {
    const found = users.find(
      u => u.username === username.trim().toLowerCase() && u.password === password
    )
    if (found) { setUser(found); writeSession(found); return found }
    return null
  }

  const logout = () => { writeSession(null); setUser(null) }

  // ── User management (admin only) ──
  const addUser = (data) => {
    const username = data.username.trim().toLowerCase()
    if (users.some(u => u.username === username)) {
      return { error: 'That username is already taken.' }
    }
    const newUser = {
      id: Date.now(),
      name: data.name.trim(),
      username,
      password: data.password,
      role: data.role === 'admin' ? 'admin' : 'employee',
    }
    setUsers(prev => [...prev, newUser])
    return { user: newUser }
  }

  const deleteUser = (id) => {
    if (id === user?.id) return { error: "You can't remove your own account." }
    setUsers(prev => prev.filter(u => u.id !== id))
    return {}
  }

  const isAdmin = user?.role === 'admin'

  return (
    <AuthContext.Provider value={{ user, users, login, logout, addUser, deleteUser, isAdmin }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
