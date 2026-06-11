import { useState } from 'react'
import { UserPlus, Trash2, Shield, User } from 'lucide-react'
import { useAuth, ROLES } from '../context/AuthContext'

export default function AdminPage() {
  const { user, users, addUser, deleteUser } = useAuth()
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('employee')
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')

  const inputCls = 'w-full px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand/40 transition-colors'

  const submit = (e) => {
    e.preventDefault()
    setError(''); setMsg('')
    const res = addUser({ name, username, password, role })
    if (res.error) { setError(res.error); return }
    setName(''); setUsername(''); setPassword(''); setRole('employee')
    setMsg(`Added ${res.user.name}.`)
    setTimeout(() => setMsg(''), 3000)
  }

  const remove = (u) => {
    if (!window.confirm(`Remove ${u.name}? They will lose access immediately.`)) return
    const res = deleteUser(u.id)
    if (res.error) { setError(res.error); setTimeout(() => setError(''), 3000) }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      {/* Add user */}
      <div className="lg:col-span-2">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-6">
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-slate-100 mb-5">
            <UserPlus size={18} className="text-brand-dark" /> Add user
          </h2>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Full name</label>
              <input value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Amy Smith" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Username</label>
              <input value={username} onChange={e => setUsername(e.target.value)} required placeholder="e.g. amy" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Password</label>
              <input value={password} onChange={e => setPassword(e.target.value)} required placeholder="Temporary password" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Role</label>
              <select value={role} onChange={e => setRole(e.target.value)} className={inputCls}>
                {Object.entries(ROLES).map(([key, { label }]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {msg && <p className="text-sm text-emerald-600 dark:text-emerald-400">{msg}</p>}
            <button type="submit" style={{ backgroundColor: '#FECD28' }}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-[#111111] hover:brightness-95 transition-all">
              <UserPlus size={15} /> Add user
            </button>
          </form>
        </div>
      </div>

      {/* User list */}
      <div className="lg:col-span-3">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Users <span className="text-slate-400 font-normal">({users.length})</span></h2>
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-slate-700">
            {users.map(u => (
              <li key={u.id} className="px-6 py-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-full ${u.role === 'admin' ? 'bg-brand/20 text-brand-dark' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300'}`}>
                    {u.role === 'admin' ? <Shield size={16} /> : <User size={16} />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">{u.name}</span>
                      {u.id === user.id && <span className="text-xs text-slate-400">(you)</span>}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">@{u.username} · {ROLES[u.role]?.label || u.role}</p>
                  </div>
                </div>
                <button onClick={() => remove(u)} disabled={u.id === user.id} title={u.id === user.id ? "You can't remove yourself" : 'Remove user'}
                  className="shrink-0 p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 transition-colors">
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
