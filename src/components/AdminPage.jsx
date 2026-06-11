import { useState, useMemo } from 'react'
import { UserPlus, Trash2, Shield, User, Download, SlidersHorizontal } from 'lucide-react'
import { useAuth, ROLES } from '../context/AuthContext'
import { useLeave } from '../context/LeaveContext'
import { balancesFor } from '../leaveCalc'
import { downloadMonthlyPdf } from '../monthlyReport'

const num = (v) => Number(v) || 0

export default function AdminPage() {
  const { user, users, addUser, updateUser, deleteUser } = useAuth()
  const { requests } = useLeave()
  const [form, setForm] = useState({ name: '', username: '', password: '', role: 'employee', approverId: '', startDate: '' })
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const now = new Date()
  const [reportMonth, setReportMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const inputCls = 'w-full px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand/40 transition-colors'
  const cellSelect = 'text-xs border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 dark:text-slate-100 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand/40'
  const numCell = 'w-20 text-xs border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 dark:text-slate-100 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand/40'

  const flash = (setter, text) => { setter(text); setTimeout(() => setter(''), 3500) }

  const submit = async (e) => {
    e.preventDefault()
    setError(''); setMsg('')
    const res = await addUser(form)
    if (res.error) { setError(res.error); return }
    setForm({ name: '', username: '', password: '', role: 'employee', approverId: '', startDate: '' })
    flash(setMsg, `Added ${res.user.name}.`)
  }

  const patch = async (id, key, value) => {
    const res = await updateUser(id, { [key]: value })
    if (res?.error) flash(setError, res.error)
  }

  const remove = async (u) => {
    if (!window.confirm(`Remove ${u.name}? They will lose access immediately.`)) return
    const res = await deleteUser(u.id)
    if (res?.error) flash(setError, res.error)
  }

  // Admin types a "remaining" number; we store it as an adjustment so accrual
  // and taken-days keep working underneath.  adjust = desired - (remaining - adjustOld)
  const setRemaining = (u, field, adjustKey, balRemaining, desiredRaw) => {
    const desired = num(desiredRaw)
    const adjustOld = num(u[adjustKey])
    const adjustNew = +(desired - (balRemaining - adjustOld)).toFixed(2)
    patch(u.id, adjustKey, adjustNew)
  }

  const [downloading, setDownloading] = useState(false)
  const downloadReport = async () => {
    setDownloading(true)
    try {
      await downloadMonthlyPdf({ month: reportMonth, users, requests })
    } catch (err) {
      flash(setError, 'Could not build the report.')
      console.error('Report failed:', err)
    } finally { setDownloading(false) }
  }

  return (
    <div className="space-y-6">
      {(error || msg) && (
        <p className={`text-sm rounded-lg px-3 py-2 ${error ? 'text-red-600 bg-red-50 dark:bg-red-900/20' : 'text-emerald-700 bg-emerald-50 dark:bg-emerald-900/20'}`}>
          {error || msg}
        </p>
      )}

      {/* Monthly report */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-6 flex flex-col sm:flex-row sm:items-end gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-slate-100"><Download size={18} className="text-brand-dark" /> Monthly leave report</h2>
          <p className="text-xs text-slate-400 mt-1">A branded PDF: each employee with the days of leave <span className="font-semibold">taken</span> per type that month.</p>
        </div>
        <div className="flex items-end gap-2 sm:ml-auto">
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Month</label>
            <input type="month" value={reportMonth} onChange={e => setReportMonth(e.target.value)} className={inputCls} />
          </div>
          <button onClick={downloadReport} disabled={downloading} style={{ backgroundColor: '#FECD28' }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-[#111111] disabled:opacity-50 hover:brightness-95 transition-all">
            {downloading
              ? <span className="w-4 h-4 border-2 border-[#111111]/30 border-t-[#111111] rounded-full animate-spin" />
              : <Download size={15} />}
            {downloading ? 'Building…' : 'Download PDF'}
          </button>
        </div>
      </div>

      {/* Add user */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-6">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-slate-100 mb-5">
          <UserPlus size={18} className="text-brand-dark" /> Add user
        </h2>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Full name</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} required placeholder="e.g. Amy Smith" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Username</label>
            <input value={form.username} onChange={e => set('username', e.target.value)} required placeholder="e.g. amy" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Password</label>
            <input value={form.password} onChange={e => set('password', e.target.value)} required placeholder="Temporary password" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Role</label>
            <select value={form.role} onChange={e => set('role', e.target.value)} className={inputCls}>
              {Object.entries(ROLES).map(([key, { label }]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Approver</label>
            <select value={form.approverId} onChange={e => set('approverId', e.target.value)} className={inputCls}>
              <option value="">— None (admin handles) —</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Start date</label>
            <input type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)} className={inputCls} />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <button type="submit" style={{ backgroundColor: '#FECD28' }}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-[#111111] hover:brightness-95 transition-all">
              <UserPlus size={15} /> Add user
            </button>
          </div>
        </form>
      </div>

      {/* Users table */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Users <span className="text-slate-400 font-normal">({users.length})</span></h2>
          <p className="text-xs text-slate-400 mt-0.5">Set each person's approver and role inline. "Approver" rights come automatically from being assigned to someone.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide border-b border-slate-200 dark:border-slate-700">
                <th className="px-6 py-3">Person</th>
                <th className="px-6 py-3">Role</th>
                <th className="px-6 py-3">Approved by</th>
                <th className="px-6 py-3">Start date</th>
                <th className="px-6 py-3 text-right">Remove</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full ${u.role === 'admin' ? 'bg-brand/20 text-brand-dark' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300'}`}>
                        {u.role === 'admin' ? <Shield size={15} /> : <User size={15} />}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-800 dark:text-slate-100">{u.name}{u.id === user.id && <span className="text-xs text-slate-400 font-normal"> (you)</span>}</div>
                        <div className="text-xs text-slate-400">@{u.username}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    <select value={u.role} onChange={e => patch(u.id, 'role', e.target.value)} className={cellSelect}>
                      {Object.entries(ROLES).map(([key, { label }]) => <option key={key} value={key}>{label}</option>)}
                    </select>
                  </td>
                  <td className="px-6 py-3">
                    <select value={u.approverId ?? ''} onChange={e => patch(u.id, 'approverId', e.target.value)} className={cellSelect}>
                      <option value="">— None —</option>
                      {users.filter(o => o.id !== u.id).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </td>
                  <td className="px-6 py-3">
                    <input type="date" value={u.startDate || ''} onChange={e => patch(u.id, 'startDate', e.target.value)} className={cellSelect} />
                  </td>
                  <td className="px-6 py-3 text-right">
                    <button onClick={() => remove(u)} disabled={u.id === user.id}
                      title={u.id === user.id ? "You can't remove yourself" : 'Remove user'}
                      className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 transition-colors">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Leave balances */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-slate-100"><SlidersHorizontal size={18} className="text-brand-dark" /> Leave balances</h2>
          <p className="text-xs text-slate-400 mt-0.5">Days each person has <span className="font-semibold">left</span>. Edit a number to override — annual still accrues and taken days are still deducted automatically.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide border-b border-slate-200 dark:border-slate-700">
                <th className="px-6 py-3">Person</th>
                <th className="px-6 py-3">Annual left</th>
                <th className="px-6 py-3">Sick left</th>
                <th className="px-6 py-3">Family left</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {users.map(u => {
                const bal = balancesFor(u, requests)
                return (
                  <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                    <td className="px-6 py-3 font-semibold text-slate-800 dark:text-slate-100">{u.name}</td>
                    <td className="px-6 py-3">
                      <input key={`a${u.id}-${bal.annual.remaining}`} type="number" step="0.25" defaultValue={bal.annual.remaining} className={numCell}
                        onBlur={e => setRemaining(u, 'annual', 'annualAdjust', bal.annual.remaining, e.target.value)} />
                    </td>
                    <td className="px-6 py-3">
                      <input key={`s${u.id}-${bal.sick.remaining}`} type="number" defaultValue={bal.sick.remaining} className={numCell}
                        onBlur={e => setRemaining(u, 'sick', 'sickAdjust', bal.sick.remaining, e.target.value)} />
                    </td>
                    <td className="px-6 py-3">
                      <input key={`f${u.id}-${bal.family.remaining}`} type="number" defaultValue={bal.family.remaining} className={numCell}
                        onBlur={e => setRemaining(u, 'family', 'familyAdjust', bal.family.remaining, e.target.value)} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
