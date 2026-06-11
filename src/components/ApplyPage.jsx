import { useState, useMemo } from 'react'
import { CalendarPlus, Trash2, Inbox } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLeave, LEAVE_TYPES, STATUS, countDays } from '../context/LeaveContext'
import { balancesFor } from '../leaveCalc'
import StatusBadge from './StatusBadge'

const fmt = (d) => d ? new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

function BalanceCard({ label, value, sub, tone = 'brand' }) {
  const tones = {
    brand: 'bg-brand/15 text-brand-dark',
    sky: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
    slate: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  }
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-4">
      <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${tones[tone]}`}>{label}</span>
      <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

export default function ApplyPage() {
  const { user, userName } = useAuth()
  const { requests, submitRequest, cancelRequest } = useLeave()
  const [type, setType] = useState(LEAVE_TYPES[0])
  const [otherLabel, setOtherLabel] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [msg, setMsg] = useState('')

  const mine = useMemo(() => requests.filter(r => r.employeeId === user.id), [requests, user.id])
  const bal = useMemo(() => balancesFor(user, requests), [user, requests])
  const days = countDays(startDate, endDate)

  const submit = (e) => {
    e.preventDefault()
    if (days < 1) { setMsg('Please pick a valid date range.'); return }
    if (type === 'Other' && !otherLabel.trim()) { setMsg('Please specify the type of leave.'); return }
    submitRequest({ employee: user, type, otherLabel, startDate, endDate, reason })
    setType(LEAVE_TYPES[0]); setOtherLabel(''); setStartDate(''); setEndDate(''); setReason('')
    setMsg('Leave request submitted to ' + (user.approverId ? userName(user.approverId) : 'an admin') + '.')
    setTimeout(() => setMsg(''), 4000)
  }

  const inputCls = 'w-full px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand/40 transition-colors'

  return (
    <div className="space-y-6">
      {/* Balances */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <BalanceCard label="Annual" tone="brand"
          value={`${bal.annual.remaining} days`}
          sub={`${bal.annual.accrued} accrued · ${bal.annual.taken} taken (1.25/mo)`} />
        <BalanceCard label="Sick" tone="sky"
          value={`${bal.sick.remaining} days`}
          sub={`of ${bal.sick.entitlement} this 3-yr cycle · ${bal.sick.taken} taken`} />
        <BalanceCard label="Family Resp." tone="slate"
          value={`${bal.family.remaining} days`}
          sub={`of ${bal.family.entitlement} this year · ${bal.family.taken} taken`} />
        <BalanceCard label="Unpaid / Other" tone="slate"
          value={`${bal.unpaid.taken + bal.other.taken} days`} sub="taken" />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Apply form */}
        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-6">
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-slate-100 mb-5">
              <CalendarPlus size={18} className="text-brand-dark" /> Apply for leave
            </h2>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Leave type</label>
                <select value={type} onChange={e => setType(e.target.value)} className={inputCls}>
                  {LEAVE_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              {type === 'Other' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Specify type</label>
                  <input value={otherLabel} onChange={e => setOtherLabel(e.target.value)} placeholder="e.g. Study leave" className={inputCls} />
                </div>
              )}
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
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Notes</label>
                <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="Add any notes for your approver" className={inputCls + ' resize-none'} />
              </div>
              {days > 0 && (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Total: <span className="font-semibold text-slate-700 dark:text-slate-200">{days} day{days !== 1 ? 's' : ''}</span>
                  <span className="text-slate-400"> · approver: {user.approverId ? userName(user.approverId) : 'admin'}</span>
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
                <p className="text-sm">No requests yet. Apply on the left.</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                {mine.map(r => (
                  <li key={r.id} className="px-6 py-4 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-slate-800 dark:text-slate-100">
                          {r.type === 'Other' && r.otherLabel ? `Other — ${r.otherLabel}` : r.type}
                        </span>
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
    </div>
  )
}
