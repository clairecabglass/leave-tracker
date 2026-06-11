import { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext(null)

// Two account roles. "Approver" is NOT a role — it's derived from whether any
// user lists you as their approverId, so anyone (employee or admin) can approve.
export const ROLES = {
  employee: { label: 'Employee' },
  admin:    { label: 'Admin' },
}

// Seed = the real CabGlass org so approver chains are demonstrable.
//   Noel (boss)  approves  Ashton, Amy
//   Ashton       approves  Jono, Laurenso
//   Amy          approves  Brendon DB, Brendon V
// Claire is the system admin. approverId = who approves THIS person's leave.
const SEED_USERS = [
  { id: 1, name: 'Claire',     username: 'admin',  password: 'admin123',  role: 'admin',    approverId: null, startDate: '2020-01-01' },
  { id: 2, name: 'Noel',       username: 'noel',   password: 'noel123',   role: 'admin',    approverId: null, startDate: '2015-03-01' },
  { id: 3, name: 'Ashton',     username: 'ashton', password: 'ashton123', role: 'employee', approverId: 2,    startDate: '2019-06-01' },
  { id: 4, name: 'Amy',        username: 'amy',    password: 'amy123',    role: 'employee', approverId: 2,    startDate: '2018-09-01' },
  { id: 5, name: 'Jono',       username: 'jono',   password: 'jono123',   role: 'employee', approverId: 3,    startDate: '2021-02-01' },
  { id: 6, name: 'Laurenso',   username: 'laurenso', password: 'laurenso123', role: 'employee', approverId: 3, startDate: '2022-07-01' },
  { id: 7, name: 'Brendon DB', username: 'brendondb', password: 'brendondb123', role: 'employee', approverId: 4, startDate: '2020-11-01' },
  { id: 8, name: 'Brendon V',  username: 'brendonv',  password: 'brendonv123',  role: 'employee', approverId: 4, startDate: '2023-01-15' },
]

const USERS_KEY = 'leave_users'
const SESSION_KEY = 'leave_session'
const IDLE_MS = 12 * 60 * 60 * 1000

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
      localStorage.removeItem(SESSION_KEY); return null
    }
    const fresh = users.find(u => u.id === s.user.id)
    return fresh || s.user
  } catch (e) { return null }
}

export function AuthProvider({ children }) {
  const [users, setUsers] = useState(loadUsers)
  const [user, setUser] = useState(() => loadSession(loadUsers()))

  useEffect(() => { localStorage.setItem(USERS_KEY, JSON.stringify(users)) }, [users])

  const writeSession = (u) => {
    if (!u) { localStorage.removeItem(SESSION_KEY); return }
    const safe = { id: u.id, name: u.name, username: u.username, role: u.role }
    localStorage.setItem(SESSION_KEY, JSON.stringify({ user: safe, expiresAt: Date.now() + IDLE_MS }))
  }

  // Keep the logged-in user object in sync with edits to the users list.
  useEffect(() => {
    if (!user) return
    const fresh = users.find(u => u.id === user.id)
    if (!fresh) { logout(); return }
    if (fresh !== user) setUser(fresh)
  }, [users]) // eslint-disable-line

  useEffect(() => {
    if (!user) return
    let last = 0
    const bump = () => { const now = Date.now(); if (now - last > 30000) { last = now; writeSession(user) } }
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll']
    events.forEach(e => window.addEventListener(e, bump, { passive: true }))
    const check = setInterval(() => {
      const raw = localStorage.getItem(SESSION_KEY)
      if (!raw) { setUser(null); return }
      try { const s = JSON.parse(raw); if (Date.now() > s.expiresAt) { localStorage.removeItem(SESSION_KEY); setUser(null) } } catch (e) {}
    }, 60000)
    return () => { events.forEach(e => window.removeEventListener(e, bump)); clearInterval(check) }
  }, [user])

  const login = (username, password) => {
    const found = users.find(u => u.username === username.trim().toLowerCase() && u.password === password)
    if (found) { setUser(found); writeSession(found); return found }
    return null
  }

  const logout = () => { writeSession(null); setUser(null) }

  // ── User management (admin only) ──
  const addUser = (data) => {
    const username = data.username.trim().toLowerCase()
    if (users.some(u => u.username === username)) return { error: 'That username is already taken.' }
    const newUser = {
      id: Date.now(),
      name: data.name.trim(),
      username,
      password: data.password,
      role: data.role === 'admin' ? 'admin' : 'employee',
      approverId: data.approverId ? Number(data.approverId) : null,
      startDate: data.startDate || '',
    }
    setUsers(prev => [...prev, newUser])
    return { user: newUser }
  }

  const updateUser = (id, patch) => {
    const clean = { ...patch }
    if ('username' in clean) {
      const username = clean.username.trim().toLowerCase()
      if (users.some(u => u.username === username && u.id !== id)) return { error: 'That username is already taken.' }
      clean.username = username
    }
    if ('approverId' in clean) clean.approverId = clean.approverId ? Number(clean.approverId) : null
    if ('approverId' in clean && Number(clean.approverId) === id) return { error: 'A user cannot approve their own leave.' }
    setUsers(prev => prev.map(u => u.id === id ? { ...u, ...clean } : u))
    return {}
  }

  const deleteUser = (id) => {
    if (id === user?.id) return { error: "You can't remove your own account." }
    const reports = users.filter(u => u.approverId === id)
    if (reports.length) return { error: `${userName(id)} approves ${reports.length} ${reports.length === 1 ? 'person' : 'people'}. Reassign them first.` }
    setUsers(prev => prev.filter(u => u.id !== id))
    return {}
  }

  const userName = (id) => users.find(u => u.id === id)?.name || '—'

  // People whose leave THIS user approves.
  const reportsOf = (id) => users.filter(u => u.approverId === id)
  const isApproverFor = (id) => reportsOf(id).length > 0

  const isAdmin = user?.role === 'admin'
  const isApprover = !!user && isApproverFor(user.id)

  return (
    <AuthContext.Provider value={{
      user, users, login, logout, addUser, updateUser, deleteUser,
      userName, reportsOf, isApproverFor, isAdmin, isApprover,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
