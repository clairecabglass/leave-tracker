import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react'
import { useLeave, STATUS } from '../context/LeaveContext'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

// Stable colour per employee so the same person reads the same across days.
const PALETTE = [
  'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200',
  'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200',
  'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
  'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-200',
  'bg-lime-100 text-lime-800 dark:bg-lime-900/40 dark:text-lime-200',
  'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/40 dark:text-fuchsia-200',
]
const colourFor = (id) => PALETTE[Math.abs(Number(id)) % PALETTE.length]

// Local Y-M-D key (avoid toISOString, which shifts to UTC and breaks day alignment).
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
// Parse a 'YYYY-MM-DD' string as a LOCAL date, not UTC.
const parseLocal = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }

export default function CalendarPage() {
  const { requests } = useLeave()
  const today = new Date()
  const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() })

  const approved = useMemo(() => requests.filter(r => r.status === STATUS.APPROVED), [requests])

  // Map ISO date -> [{name, id, type}] for everyone on approved leave that day.
  const byDay = useMemo(() => {
    const m = {}
    for (const r of approved) {
      const start = parseLocal(r.startDate), end = parseLocal(r.endDate)
      if (isNaN(start) || isNaN(end)) continue
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const key = iso(d)
        ;(m[key] ||= []).push({ id: r.employeeId, name: r.employeeName, type: r.type })
      }
    }
    return m
  }, [approved])

  // Build the grid (Mon-first), padded to full weeks.
  const cells = useMemo(() => {
    const first = new Date(view.year, view.month, 1)
    const startPad = (first.getDay() + 6) % 7 // Mon=0
    const daysInMonth = new Date(view.year, view.month + 1, 0).getDate()
    const list = []
    for (let i = 0; i < startPad; i++) list.push(null)
    for (let d = 1; d <= daysInMonth; d++) list.push(new Date(view.year, view.month, d))
    while (list.length % 7 !== 0) list.push(null)
    return list
  }, [view])

  const step = (delta) => setView(v => {
    const m = v.month + delta
    return { year: v.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 }
  })

  const isToday = (d) => d && iso(d) === iso(today)

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
          {MONTHS[view.month]} {view.year}
        </h2>
        <div className="flex items-center gap-1">
          <button onClick={() => step(-1)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"><ChevronLeft size={18} /></button>
          <button onClick={() => setView({ year: today.getFullYear(), month: today.getMonth() })}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">Today</button>
          <button onClick={() => step(1)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"><ChevronRight size={18} /></button>
        </div>
      </div>

      <div className="grid grid-cols-7 text-center text-xs font-semibold text-slate-400 border-b border-slate-100 dark:border-slate-700">
        {WEEKDAYS.map(w => <div key={w} className="py-2">{w}</div>)}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          const people = d ? (byDay[iso(d)] || []) : []
          const overlap = people.length > 1
          return (
            <div key={i} className={`min-h-[96px] border-b border-r border-slate-100 dark:border-slate-700 p-1.5 ${!d ? 'bg-slate-50/50 dark:bg-slate-900/30' : ''}`}>
              {d && (
                <>
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-semibold ${isToday(d) ? 'bg-brand text-[#111111] rounded-full w-5 h-5 flex items-center justify-center' : 'text-slate-400'}`}>{d.getDate()}</span>
                    {overlap && <AlertTriangle size={12} className="text-amber-500" title={`${people.length} people on leave`} />}
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {people.slice(0, 3).map((p, j) => (
                      <div key={j} className={`truncate rounded px-1.5 py-0.5 text-[11px] font-medium ${colourFor(p.id)}`} title={`${p.name} — ${p.type}`}>
                        {p.name}
                      </div>
                    ))}
                    {people.length > 3 && <div className="text-[11px] text-slate-400 px-1">+{people.length - 3} more</div>}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>

      <div className="px-6 py-3 text-xs text-slate-400 flex items-center gap-1.5">
        <AlertTriangle size={12} className="text-amber-500" /> highlights days where more than one person is on leave.
      </div>
    </div>
  )
}
