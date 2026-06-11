import { useState, useMemo } from 'react'
import { CalendarPlus, Check, X, Trash2, Inbox } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLeave, LEAVE_TYPES, STATUS, countDays } from '../context/LeaveContext'
import StatusBadge from './StatusBadge'

function fmt(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── Employee view: request form + own request history ──
function EmployeeLeave() {
  const { user } = useAuth()
  const { requests, submitRequest, cancelRequest } = useLeave()
  const [type, setType] = useState(LEAVE_TYPES[0])
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [msg, setMsg] = useState('')

  const mine = useMemo(
    () => requests.filter(r => r.employeeId === user.id),
    [requests, user.id]
  )
  const days = countDays(startDate, endDate)

  const submit = (e) => {
    e.preventDefault()
    if (days < 1) { setMsg('Please pick a valid date range.'); return }
    submitRequest({ employee: user, type, startDate, endDate, reason })
    setStartDate(''); setEndDate(''); setReason(''); setType(LEAVE_TYPES[0])
    setMsg('Leave request submitted.')
    setTimeout(() => setMsg(''), 3000)
  }

  const inputCls = 'w-full px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand/40 transition-colors'

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      {/* Request form */}
      <div className="lg:col-span-2">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-6">
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-slate-100 mb-5">
            <CalendarPlus size={18} className="text-brand-dark" /> Request leave
          </h2>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Leave type</label>
              <select value={type} onChange={e => setType(e.target.value)} className={inputCls}>
                {LEAVE_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">From</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">To</label>
                <input type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} required className={inputCls} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Reason</label>
              <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="Optional note for the approver"
                className={inputCls + ' resize-none'} />
            </div>
            {days > 0 && (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Total: <span className="font-semibold text-slate-700 dark:text-slate-200">{days} day{days !== 1 ? 's' : ''}</span>
              </p>
            )}
            {msg && <p className="text-sm text-emerald-600 dark:text-emerald-400">{msg}</p>}
            <button type="submit" style={{ backgroundColor: '#FECD28' }}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-[#111111] hover:brightness-95 transition-all">
              <CalendarPlus size={15} /> Submit request
            </button>
          </form>
        </div>
      </div>

      {/* My requests */}
      <div className="lg:col-span-3">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">My leave requests</h2>
          </div>
          {mine.length === 0 ? (
            <div className="p-10 text-center text-slate-400">
              <Inbox size={28} className="mx-auto mb-2" />
              <p className="text-sm">No requests yet. Submit one on the left.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-700">
              {mine.map(r => (
                <li key={r.id} className="px-6 py-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-slate-800 dark:text-slate-100">{r.type}</span>
                      <StatusBadge status={r.status} />
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {fmt(r.startDate)} → {fmt(r.endDate)} · {r.days} day{r.days !== 1 ? 's' : ''}
                    </p>
                    {r.reason && <p className="text-xs text-slate-400 mt-1 truncate">{r.reason}</p>}
                  </div>
                  {r.status === STATUS.PENDING && (
                    <button onClick={() => cancelRequest(r.id)} title="Cancel request"
                      className="shrink-0 p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                      <Trash2 size={16} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Admin view: every request, with approve / decline ──
function AdminLeave() {
  const { user } = useAuth()
  const { requests, decideRequest } = useLeave()
  const [filter, setFilter] = useState('all')

  const filtered = useMemo(() => {
    if (filter === 'all') return requests
    return requests.filter(r => r.status === filter)
  }, [requests, filter])

  const counts = useMemo(() => ({
    all: requests.length,
    [STATUS.PENDING]: requests.filter(r => r.status === STATUS.PENDING).length,
    [STATUS.APPROVED]: requests.filter(r => r.status === STATUS.APPROVED).length,
    [STATUS.DECLINED]: requests.filter(r => r.status === STATUS.DECLINED).length,
  }), [requests])

  const tabs = [
    { key: 'all', label: 'All' },
    { key: STATUS.PENDING, label: 'Pending' },
    { key: STATUS.APPROVED, label: 'Approved' },
    { key: STATUS.DECLINED, label: 'Declined' },
  ]

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Leave requests</h2>
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 rounded-lg p-1">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setFilter(t.key)}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                filter === t.key
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}>
              {t.label} <span className="opacity-60">{counts[t.key] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="p-12 text-center text-slate-400">
          <Inbox size={28} className="mx-auto mb-2" />
          <p className="text-sm">Nothing here yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide border-b border-slate-200 dark:border-slate-700">
                <th className="px-6 py-3">Employee</th>
                <th className="px-6 py-3">Type</th>
                <th className="px-6 py-3">Dates</th>
                <th className="px-6 py-3">Days</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {filtered.map(r => (
                <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                  <td className="px-6 py-3">
                    <div className="font-semibold text-slate-800 dark:text-slate-100">{r.employeeName}</div>
                    {r.reason && <div className="text-xs text-slate-400 max-w-xs truncate">{r.reason}</div>}
                  </td>
                  <td className="px-6 py-3 text-slate-600 dark:text-slate-300">{r.type}</td>
                  <td className="px-6 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{fmt(r.startDate)} → {fmt(r.endDate)}</td>
                  <td className="px-6 py-3 text-slate-600 dark:text-slate-300">{r.days}</td>
                  <td className="px-6 py-3"><StatusBadge status={r.status} /></td>
                  <td className="px-6 py-3">
                    {r.status === STATUS.PENDING ? (
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => decideRequest(r.id, STATUS.APPROVED, user.name)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 transition-colors">
                          <Check size={13} /> Approve
                        </button>
                        <button onClick={() => decideRequest(r.id, STATUS.DECLINED, user.name)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300 transition-colors">
                          <X size={13} /> Decline
                        </button>
                      </div>
                    ) : (
                      <div className="text-right text-xs text-slate-400">
                        {r.decidedBy ? `by ${r.decidedBy}` : '—'}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function LeavePage() {
  const { isAdmin } = useAuth()
  return isAdmin ? <AdminLeave /> : <EmployeeLeave />
}
