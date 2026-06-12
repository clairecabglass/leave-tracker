import { useState } from 'react'
import { UserPlus, Trash2, Shield, User, Download, SlidersHorizontal, Send, Pencil } from 'lucide-react'
import { useAuth, ROLES } from '../context/AuthContext'
import { useLeave } from '../context/LeaveContext'
import { balancesFor } from '../leaveCalc'
import { downloadMonthlyPdf, monthlyPdfBase64 } from '../monthlyReport'
import { LIVE, apiFinalizeMonth } from '../api'

const num = (v) => Number(v) || 0

export default function AdminPage() {
  const { user, users, addUser, updateUser, deleteUser } = useAuth()
  const { requests } = useLeave()
  const [form, setForm] = useState({ name: '', username: '', password: '', email: '', role: 'employee', approverId: '', startDate: '' })
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const now = new Date()
  const [reportMonth, setReportMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
  const [editing, setEditing] = useState(null)   // user being edited
  const [edit, setEdit] = useState({})           // edit form values

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setE = (k, v) => setEdit(f => ({ ...f, [k]: v }))
  const inputCls = 'w-full px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand/40 transition-colors'
  const cellSelect = 'text-xs border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 dark:text-slate-100 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand/40'

  const flash = (setter, text) => { setter(text); setTimeout(() => setter(''), 4000) }

  const submit = async (e) => {
    e.preventDefault()
    setError(''); setMsg('')
    const res = await addUser(form)
    if (res.error) { setError(res.error); return }
    setForm({ name: '', username: '', password: '', email: '', role: 'employee', approverId: '', startDate: '' })
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

  // ── Edit user modal ──
  const openEdit = (u) => {
    const bal = balancesFor(u, requests)
    setEditing(u)
    setEdit({
      name: u.name, username: u.username, password: '', email: u.email || '',
      annualLeft: bal.annual.remaining, sickLeft: bal.sick.remaining, familyLeft: bal.family.remaining,
    })
  }

  const saveEdit = async () => {
    setError('')
    const u = editing
    const bal = balancesFor(u, requests)
    // Convert desired "days left" back into stored adjustments.
    const adj = (desired, remaining, adjustOld) => +(num(desired) - (remaining - num(adjustOld))).toFixed(2)
    const p = {
      name: edit.name.trim(),
      username: edit.username.trim(),
      email: edit.email.trim(),
      annualAdjust: adj(edit.annualLeft, bal.annual.remaining, u.annualAdjust),
      sickAdjust: adj(edit.sickLeft, bal.sick.remaining, u.sickAdjust),
      familyAdjust: adj(edit.familyLeft, bal.family.remaining, u.familyAdjust),
    }
    if (edit.password.trim()) p.password = edit.password.trim()
    const res = await updateUser(u.id, p)
    if (res?.error) { flash(setError, res.error); return }
    setEditing(null)
    flash(setMsg, `Saved ${p.name}.`)
  }

  const [downloading, setDownloading] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [recipients, setRecipients] = useState('')
  const downloadReport = async () => {
    setDownloading(true)
    try { await downloadMonthlyPdf({ month: reportMonth, users, requests }) }
    catch (err) { flash(setError, 'Could not build the report.'); console.error('Report failed:', err) }
    finally { setDownloading(false) }
  }

  const monthLabel = (() => {
    const [yy, mm] = reportMonth.split('-').map(Number)
    return new Date(yy, mm - 1, 1).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })
  })()

  const finalize = async () => {
    setError(''); setMsg('')
    if (!LIVE) { flash(setError, 'Finalize needs the live backend connected (set the Vercel env vars).'); return }
    if (!window.confirm(`Finalize ${monthLabel}? This emails the report to the accountants and saves a copy to Drive.`)) return
    setFinalizing(true)
    try {
      const { base64, fileName } = await monthlyPdfBase64({ month: reportMonth, users, requests })
      const res = await apiFinalizeMonth({ month: reportMonth, monthLabel, pdfBase64: base64, fileName, finalizedBy: user.name, recipients: recipients.trim() })
      if (res?.error) { flash(setError, res.error); return }
      const where = [res.emailedTo && `emailed to ${res.emailedTo}`, res.driveLink && 'saved to Drive'].filter(Boolean).join(' and ')
      flash(setMsg, `${monthLabel} finalized — ${where || 'recorded'}.`)
    } catch (err) { flash(setError, 'Finalize failed.'); console.error('Finalize failed:', err) }
    finally { setFinalizing(false) }
  }

  return (
    <div className="space-y-6">
      {(error || msg) && (
        <p className={`text-sm rounded-lg px-3 py-2 ${error ? 'text-red-600 bg-red-50 dark:bg-red-900/20' : 'text-emerald-700 bg-emerald-50 dark:bg-emerald-900/20'}`}>
          {error || msg}
        </p>
      )}

      {/* Monthly report */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-6 space-y-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-slate-100"><Download size={18} className="text-brand-dark" /> Monthly leave report</h2>
          <p className="text-xs text-slate-400 mt-1">A branded PDF: each employee with the days of leave <span className="font-semibold">scheduled</span> per type that month (approved &amp; pending). <span className="font-semibold">Download</span> a copy, or <span className="font-semibold">Finalize</span> to email it to the accountants and save it to Drive.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Month</label>
            <input type="month" value={reportMonth} onChange={e => setReportMonth(e.target.value)} className={inputCls} />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Email to (optional — overrides the default)</label>
            <input type="text" value={recipients} onChange={e => setRecipients(e.target.value)} placeholder="accounts@example.com, ..." className={inputCls} />
          </div>
          <button onClick={downloadReport} disabled={downloading}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 disabled:opacity-50 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all">
            {downloading ? <span className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" /> : <Download size={15} />}
            {downloading ? 'Building…' : 'Download PDF'}
          </button>
          <button onClick={finalize} disabled={finalizing} style={{ backgroundColor: '#FECD28' }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-[#111111] disabled:opacity-50 hover:brightness-95 transition-all">
            {finalizing ? <span className="w-4 h-4 border-2 border-[#111111]/30 border-t-[#111111] rounded-full animate-spin" /> : <Send size={15} />}
            {finalizing ? 'Finalizing…' : 'Finalize & email'}
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
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Email (for notifications)</label>
            <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="amy@cabglass.co.za" className={inputCls} />
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
          <p className="text-xs text-slate-400 mt-0.5">Change role/approver/start date inline. Use <span className="font-semibold">Edit</span> for name, password, email and leave balances.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide border-b border-slate-200 dark:border-slate-700">
                <th className="px-6 py-3">Person</th>
                <th className="px-6 py-3">Role</th>
                <th className="px-6 py-3">Approved by</th>
                <th className="px-6 py-3">Start date</th>
                <th className="px-6 py-3 text-right">Actions</th>
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
                        <div className="text-xs text-slate-400">@{u.username}{u.email ? ` · ${u.email}` : ''}</div>
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
                  <td className="px-6 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(u)} title="Edit user"
                        className="p-2 rounded-lg text-slate-400 hover:text-brand-dark hover:bg-brand/10 transition-colors">
                        <Pencil size={16} />
                      </button>
                      <button onClick={() => remove(u)} disabled={u.id === user.id}
                        title={u.id === user.id ? "You can't remove yourself" : 'Remove user'}
                        className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 transition-colors">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Leave balances (read-only overview; edit via the pencil) */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-slate-100"><SlidersHorizontal size={18} className="text-brand-dark" /> Leave balances</h2>
          <p className="text-xs text-slate-400 mt-0.5">Days each person has <span className="font-semibold">left</span>. Edit a person to override a number.</p>
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
                    <td className="px-6 py-3 text-slate-600 dark:text-slate-300">{bal.annual.remaining}</td>
                    <td className="px-6 py-3 text-slate-600 dark:text-slate-300">{bal.sick.remaining}</td>
                    <td className="px-6 py-3 text-slate-600 dark:text-slate-300">{bal.family.remaining}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit user modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={() => setEditing(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-800 shadow-xl border border-slate-200 dark:border-slate-700 p-6 max-h-[90vh] overflow-y-auto" onMouseDown={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-4">Edit {editing.name}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Full name</label>
                <input value={edit.name} onChange={e => setE('name', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Username</label>
                <input value={edit.username} onChange={e => setE('username', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">New password (leave blank to keep)</label>
                <input value={edit.password} onChange={e => setE('password', e.target.value)} placeholder="••••••••" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Email (for notifications)</label>
                <input type="email" value={edit.email} onChange={e => setE('email', e.target.value)} placeholder="name@cabglass.co.za" className={inputCls} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Annual left</label>
                  <input type="number" step="0.25" value={edit.annualLeft} onChange={e => setE('annualLeft', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Sick left</label>
                  <input type="number" value={edit.sickLeft} onChange={e => setE('sickLeft', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Family left</label>
                  <input type="number" value={edit.familyLeft} onChange={e => setE('familyLeft', e.target.value)} className={inputCls} />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 mt-6">
              <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">Cancel</button>
              <button onClick={saveEdit} style={{ backgroundColor: '#FECD28' }}
                className="px-5 py-2 rounded-xl text-sm font-bold text-[#111111] hover:brightness-95 transition-all">Save changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
