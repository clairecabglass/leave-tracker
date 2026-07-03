import { useState, useMemo } from 'react'
import { FileText, Download, Printer, Mail, Check, AlertCircle, X, Info } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useIncentives } from '../context/IncentivesContext'
import { downloadIncentivePdf, printIncentivePdf, incentivePdfBase64 } from '../incentiveReport'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

function periodsInRange(from, to) {
  if (!from || !to || from > to) return []
  const [fy, fm] = from.slice(0,7).split('-').map(Number)
  const [ty, tm] = to.slice(0,7).split('-').map(Number)
  const out = []; let y = fy, m = fm
  while (y < ty || (y === ty && m <= tm)) { out.push(`${y}-${String(m).padStart(2,'0')}`); if (++m > 12) { m = 1; y++ } }
  return out
}

export default function IncentiveReportTab() {
  const { users, user: me } = useAuth()
  const { commissionPeriods, settings, sendAuditorReport } = useIncentives()

  const today = new Date()
  const [from, setFrom] = useState(ymd(new Date(today.getFullYear(), today.getMonth(), 1)))
  const [to, setTo]     = useState(ymd(today))
  const [busy, setBusy] = useState('')
  const [toast, setToast] = useState(null)

  const covered = useMemo(() => periodsInRange(from, to).filter(p => commissionPeriods[p]), [from, to, commissionPeriods])
  const args = { from, to, commissionPeriods, users }
  const inputCls = 'px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#FECD28]/60'

  const doDownload = async () => { setBusy('download'); try { await downloadIncentivePdf(args) } finally { setBusy('') } }
  const doPrint    = async () => { setBusy('print');    try { await printIncentivePdf(args) } finally { setBusy('') } }

  const doEmail = async () => {
    if (!settings.auditorEmail) { setToast({ ok: false, msg: 'Set the auditor email in Admin → Settings first.' }); return }
    setBusy('email')
    try {
      const { base64, fileName } = await incentivePdfBase64(args)
      const res = await sendAuditorReport({ from, to, base64, fileName, sentBy: me.name })
      setToast(res?.ok
        ? { ok: true, msg: `Report emailed to auditors${res.note ? ' — ' + res.note : '.'}` }
        : { ok: false, msg: res?.error || 'Send failed.' })
    } catch (e) { setToast({ ok: false, msg: 'Could not build/send the report.' }) }
    finally { setBusy('') }
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
          <FileText size={16}/> <span className="font-semibold text-sm">Date-range report</span>
        </div>
        <p className="text-xs text-slate-400">Pick a range, then download, print, or email it to the auditors. The PDF covers month-end payouts, turnover, and branch summary totals for every saved month in the range.</p>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">From</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inputCls}/>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">To</label>
            <input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} className={inputCls}/>
          </div>
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
          <Info size={12}/>
          {covered.length
            ? `${covered.length} month${covered.length === 1 ? '' : 's'} with saved data: ${covered.map(p => `${MONTHS[Number(p.slice(5))-1]} ${p.slice(0,4)}`).join(', ')}`
            : 'No saved commission data in this range yet — save a month in the Commission tab first.'}
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <button onClick={doDownload} disabled={!covered.length || busy}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-black bg-[#FECD28] hover:bg-[#f0c020] disabled:opacity-40 transition-colors">
            <Download size={14}/> {busy === 'download' ? 'Building…' : 'Download PDF'}
          </button>
          <button onClick={doPrint} disabled={!covered.length || busy}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 transition-colors">
            <Printer size={14}/> {busy === 'print' ? 'Opening…' : 'Print'}
          </button>
          <button onClick={doEmail} disabled={!covered.length || busy}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-slate-800 dark:bg-slate-700 hover:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-40 transition-colors">
            <Mail size={14}/> {busy === 'email' ? 'Sending…' : 'Email auditors'}
          </button>
        </div>

        <p className="text-xs text-slate-400 flex items-center gap-1.5">
          <Info size={11}/>
          {settings.auditorEmail
            ? `Auditor: ${settings.auditorEmail}${settings.incentiveHook ? ` · also copied to the Pabbly hook` : ''}`
            : 'No auditor email set — configure it in Admin → Settings.'}
        </p>

        {toast && (
          <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium
            ${toast.ok ? 'bg-emerald-50 border border-emerald-200 text-emerald-800 dark:bg-emerald-900/30 dark:border-emerald-700 dark:text-emerald-300'
                       : 'bg-red-50 border border-red-200 text-red-800 dark:bg-red-900/30 dark:border-red-700 dark:text-red-300'}`}>
            {toast.ok ? <Check size={14}/> : <AlertCircle size={14}/>} {toast.msg}
            <button onClick={() => setToast(null)} className="ml-auto opacity-60 hover:opacity-100"><X size={12}/></button>
          </div>
        )}
      </div>
    </div>
  )
}
