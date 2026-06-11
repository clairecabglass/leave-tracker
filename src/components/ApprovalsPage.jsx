import { useMemo, useState } from 'react'
import { Check, X, Inbox, Users, Undo2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLeave, STATUS } from '../context/LeaveContext'
import StatusBadge from './StatusBadge'

const fmt = (d) => d ? new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export default function ApprovalsPage() {
  const { user, reportsOf, isAdmin } = useAuth()
  const { requests, decideRequest, undoRequest } = useLeave()
  const [filter, setFilter] = useState(STATUS.PENDING)
  const [decision, setDecision] = useState(null) // { req, status }
  const [note, setNote] = useState('')

  const reportIds = useMemo(() => new Set(reportsOf(user.id).map(u => u.id)), [reportsOf, user.id])
  const queue = useMemo(() => requests.filter(r =>
    reportIds.has(r.employeeId) || r.approverId === user.id || (isAdmin && !r.approverId && r.employeeId !== user.id)
  ), [requests, reportIds, user.id, isAdmin])

  const counts = useMemo(() => ({
    [STATUS.PENDING]: queue.filter(r => r.status === STATUS.PENDING).length,
    [STATUS.APPROVED]: queue.filter(r => r.status === STATUS.APPROVED).length,
    [STATUS.DECLINED]: queue.filter(r => r.status === STATUS.DECLINED).length,
    all: queue.length,
  }), [queue])

  const filtered = filter === 'all' ? queue : queue.filter(r => r.status === filter)
  const tabs = [
    { key: STATUS.PENDING, label: 'Pending' },
    { key: STATUS.APPROVED, label: 'Approved' },
    { key: STATUS.DECLINED, label: 'Declined' },
    { key: 'all', label: 'All' },
  ]
  const myReports = reportsOf(user.id)

  const openDecision = (req, status) => { setDecision({ req, status }); setNote('') }
  const confirmDecision = () => {
    decideRequest(decision.req.id, decision.status, user.name, note.trim())
    setDecision(null); setNote('')
  }

  return (
    <div className="space-y-4">
      {myReports.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Users size={15} /> You approve leave for: <span className="font-semibold text-slate-700 dark:text-slate-200">{myReports.map(u => u.name).join(', ')}</span>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Approvals</h2>
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 rounded-lg p-1">
            {tabs.map(t => (
              <button key={t.key} onClick={() => setFilter(t.key)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                  filter === t.key ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                {t.label} <span className="opacity-60">{counts[t.key] ?? 0}</span>
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Inbox size={28} className="mx-auto mb-2" />
            <p className="text-sm">Nothing to review here.</p>
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
                    <td className="px-6 py-3 align-top">
                      <div className="font-semibold text-slate-800 dark:text-slate-100">{r.employeeName}</div>
                      {r.reason && <div className="text-xs text-slate-400 max-w-xs">{r.reason}</div>}
                    </td>
                    <td className="px-6 py-3 align-top text-slate-600 dark:text-slate-300">
                      {r.type === 'Other' && r.otherLabel ? `Other — ${r.otherLabel}` : r.type}
                    </td>
                    <td className="px-6 py-3 align-top text-slate-600 dark:text-slate-300 whitespace-nowrap">{fmt(r.startDate)} → {fmt(r.endDate)}</td>
                    <td className="px-6 py-3 align-top text-slate-600 dark:text-slate-300">{r.days}</td>
                    <td className="px-6 py-3 align-top">
                      <StatusBadge status={r.status} />
                      {r.decisionNote && <div className="text-xs text-slate-400 mt-1 max-w-[180px] italic">“{r.decisionNote}”</div>}
                    </td>
                    <td className="px-6 py-3 align-top">
                      {r.status === STATUS.PENDING ? (
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => openDecision(r, STATUS.APPROVED)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 transition-colors">
                            <Check size={13} /> Approve
                          </button>
                          <button onClick={() => openDecision(r, STATUS.DECLINED)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300 transition-colors">
                            <X size={13} /> Decline
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-xs text-slate-400">{r.decidedBy ? `by ${r.decidedBy}` : ''}</span>
                          <button onClick={() => { if (window.confirm('Undo this decision and set it back to Pending?')) undoRequest(r.id) }}
                            title="Undo decision"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 transition-colors">
                            <Undo2 size={13} /> Undo
                          </button>
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

      {/* Decision modal */}
      {decision && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={() => setDecision(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-800 shadow-xl border border-slate-200 dark:border-slate-700 p-6" onMouseDown={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {decision.status === STATUS.APPROVED ? 'Approve' : 'Decline'} — {decision.req.employeeName}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              {decision.req.type} · {fmt(decision.req.startDate)} → {fmt(decision.req.endDate)} · {decision.req.days} day{decision.req.days !== 1 ? 's' : ''}
            </p>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5 mt-4">Note (optional)</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} autoFocus
              placeholder="Add a note for the employee…"
              className="w-full px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand/40 resize-none" />
            <div className="flex items-center justify-end gap-2 mt-5">
              <button onClick={() => setDecision(null)} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">Cancel</button>
              <button onClick={confirmDecision}
                className={`px-4 py-2 rounded-xl text-sm font-bold text-white ${decision.status === STATUS.APPROVED ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}>
                Confirm {decision.status === STATUS.APPROVED ? 'approval' : 'decline'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
