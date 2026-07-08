import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Gift, TrendingUp, Send, Upload, ChevronLeft, ChevronRight,
  Check, AlertCircle, X, Info, Save, Mail, Users, Settings, FileText, Printer, Trash2, Download,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useIncentives, defaultPeriodData } from '../context/IncentivesContext'
import { workingDays } from '../workdays'
import {
  netTurnover, bdbOwnComm, bvOwnComm, helperBonus, branchBonus,
  whPerPersonRate, amyBonus, repMetrics,
} from '../incentiveCalc'
import IncentiveReportTab from './IncentiveReportTab'
import { downloadDailyProgressPdf } from '../incentiveReport'

// Parse a SMART IT pivot export (xlsx/csv). Returns { reps, fileDate } or { error }.
// Amy is excluded: her figure is subtracted from the Grand Total, then dropped.
async function parsePivotFile(file) {
  const ext = file.name.split('.').pop().toLowerCase()
  let rows = []
  if (ext === 'xlsx' || ext === 'xls') {
    const XLSX = await import('xlsx')
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
    rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })
  } else {
    const text = await file.text()
    rows = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
      .split('\n').filter(l => l.trim()).map(l => l.split(',').map(c => c.trim().replace(/^"|"$/g, '')))
  }
  if (!rows.length) return { error: 'File appears empty.' }
  const parsed = []
  rows.filter(r => r.some(c => String(c).trim())).forEach(row => {
    const nameCell = String(row[0] || '').trim()
    if (!nameCell) return
    let amount = null
    for (let i = 1; i < row.length; i++) { const v = parseNum(String(row[i])); if (v > 0) { amount = v; break } }
    if (amount === null) return
    const norm = nameCell.toLowerCase().replace(/\s/g, '')
    let role = null
    if (/brendonv|bv/.test(norm)) role = 'bv'
    else if (/brendond|bdb/.test(norm)) role = 'bdb'
    else if (/amyb|amy/.test(norm)) role = 'amy'
    else if (/grand|total/.test(norm)) role = 'total'
    parsed.push({ rawName: nameCell, cumulative: amount, role })
  })
  if (!parsed.length) return { error: 'Could not find recognisable rep rows. Check the file matches the expected pivot format.' }
  const amyRow = parsed.find(r => r.role === 'amy')
  const totRow = parsed.find(r => r.role === 'total')
  if (totRow && amyRow) totRow.cumulative = Math.max(0, totRow.cumulative - amyRow.cumulative)
  return { reps: parsed.filter(r => r.role !== 'amy'), fileDate: dateFromFilename(file.name) }
}

// Working days (Mon–Fri minus SA public holidays) in a 'YYYY-MM' period.
function monthWorkingDays(period) {
  const [y, m] = period.split('-').map(Number)
  const first = `${period}-01`
  const last = `${y}-${String(m).padStart(2, '0')}-${new Date(y, m, 0).getDate()}`
  return workingDays(first, last)
}

// Pull a DD-MM-YYYY date out of a filename → returns 'YYYY-MM-DD' or null.
function dateFromFilename(name) {
  const m = String(name || '').match(/(\d{2})-(\d{2})-(\d{4})/)
  if (!m) return null
  const [, dd, mm, yyyy] = m
  const d = Number(dd), mo = Number(mm)
  if (d < 1 || d > 31 || mo < 1 || mo > 12) return null
  return `${yyyy}-${mm}-${dd}`
}

// ── Period helpers ────────────────────────────────────────────────────────────

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December']

function currentPeriod() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
}
function formatPeriod(p) {
  const [y, m] = p.split('-')
  return `${MONTHS[parseInt(m)-1]} ${y}`
}
function prevPeriod(p) {
  const [y,m] = p.split('-').map(Number)
  return m===1 ? `${y-1}-12` : `${y}-${String(m-1).padStart(2,'0')}`
}
function nextPeriod(p) {
  const [y,m] = p.split('-').map(Number)
  return m===12 ? `${y+1}-01` : `${y}-${String(m+1).padStart(2,'0')}`
}

// ── Number formatting ─────────────────────────────────────────────────────────

function fmtR(n, dp=2) {
  if (n==null||n===''||isNaN(Number(n))) return '—'
  return `R ${Number(n).toLocaleString('en-ZA',{minimumFractionDigits:dp,maximumFractionDigits:dp})}`
}
function fmtRInt(n) { return fmtR(n, 0) }
function parseNum(s) {
  const c = String(s??'').replace(/[R\s]/g,'').replace(/,(?=\d{3})/g,'').replace(/[^0-9.]/g,'')
  const v = parseFloat(c); return isNaN(v) ? 0 : v
}

// ── Shared UI primitives ──────────────────────────────────────────────────────

function PeriodNav({ period, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => onChange(prevPeriod(period))} className="p-1.5 rounded-md hover:bg-black/10 dark:hover:bg-white/10 transition-colors"><ChevronLeft size={16}/></button>
      <span className="text-sm font-semibold min-w-[120px] text-center">{formatPeriod(period)}</span>
      <button onClick={() => onChange(nextPeriod(period))} className="p-1.5 rounded-md hover:bg-black/10 dark:hover:bg-white/10 transition-colors"><ChevronRight size={16}/></button>
      {period !== currentPeriod() && (
        <button onClick={() => onChange(currentPeriod())} className="ml-1 text-xs px-2 py-1 rounded bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 font-medium transition-colors">Today</button>
      )}
    </div>
  )
}

function Toast({ msg, ok, onClose }) {
  if (!msg) return null
  return (
    <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium shadow
      ${ok ? 'bg-emerald-50 border border-emerald-200 text-emerald-800 dark:bg-emerald-900/30 dark:border-emerald-700 dark:text-emerald-300'
           : 'bg-red-50 border border-red-200 text-red-800 dark:bg-red-900/30 dark:border-red-700 dark:text-red-300'}`}>
      {ok ? <Check size={14}/> : <AlertCircle size={14}/>} {msg}
      <button onClick={onClose} className="ml-1 opacity-60 hover:opacity-100"><X size={12}/></button>
    </div>
  )
}

function Card({ title, icon: Icon, children, accent }) {
  return (
    <div className={`bg-white dark:bg-slate-800 rounded-xl border ${accent ? 'border-[#FECD28]/60' : 'border-slate-200 dark:border-slate-700'} overflow-hidden`}>
      {title && (
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-700/30">
          {Icon && <Icon size={15} className="text-slate-500 dark:text-slate-400"/>}
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{title}</span>
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  )
}

function Stat({ label, value, highlight }) {
  return (
    <div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">{label}</p>
      <p className={`text-lg font-semibold ${highlight ? 'text-[#b8960a] dark:text-[#FECD28]' : 'text-slate-900 dark:text-slate-100'}`}>{value}</p>
    </div>
  )
}

function NumInput({ value, onChange, onBlur, placeholder='0', prefix='R', className='' }) {
  return (
    <div className="relative">
      {prefix && <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">{prefix}</span>}
      <input
        type="text" inputMode="decimal"
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        className={`w-full ${prefix ? 'pl-6' : 'pl-2.5'} pr-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#FECD28]/60 ${className}`}
      />
    </div>
  )
}

const ROLE_OPTIONS = [
  { value: '',          label: '— None —' },
  { value: 'bv',       label: 'BV – Salesman (Brendon Venter)' },
  { value: 'bdb',      label: 'BDB – Salesman (Brendon De Bruin)' },
  { value: 'amy',      label: 'Amy – Marketing' },
  { value: 'warehouse',label: 'Warehouse' },
]

// ── Commission tab ────────────────────────────────────────────────────────────

function CommissionTab({ period, setPeriod }) {
  const { users, user: me, updateUser } = useAuth()
  const { getPeriodData, updatePeriodData, saveCommissionPeriod, clearCommissionPeriod, sendMonthEndPayouts } = useIncentives()

  const d   = getPeriodData(period)
  const upd = (patch) => updatePeriodData(period, patch)

  // Local draft state for numeric inputs (strings while editing)
  const [drafts, setDrafts]   = useState({})
  const [saving, setSaving]   = useState(false)
  const [savingTargets, setSavingTargets] = useState(false)
  const [sending, setSending] = useState(false)
  const [toast, setToast]     = useState(null)
  const [showSetup, setShowSetup] = useState(false)
  const [imp, setImp] = useState(null)      // last import summary { bv, bdb, total, fileDate }
  const [impErr, setImpErr] = useState('')
  const commFileRef = useRef()
  const [rolesSaving, setRolesSaving] = useState(false)
  const [roleDrafts, setRoleDrafts]   = useState({})

  // Helper: read a numeric field — drafts take priority while typing
  const num = (k) => drafts[k] !== undefined ? drafts[k] : (d[k] ?? 0)
  const setDraft = (k, v) => setDrafts(prev => ({ ...prev, [k]: v }))
  const commitDraft = (k) => {
    const v = parseNum(drafts[k] ?? d[k])
    upd({ [k]: v })
    setDrafts(prev => { const n = { ...prev }; delete n[k]; return n })
  }
  const absVal = (uid) => d.absences?.[uid] ?? 0
  const setAbs = (uid, v) => upd({ absences: { ...(d.absences||{}), [uid]: parseNum(v) } })

  // Working days auto-calculate for the month (Mon–Fri minus SA public holidays),
  // but the admin can override manually if the auto count is wrong. A positive
  // override wins; otherwise use the auto count. Kept in sync into the saved
  // period (workingDays) so the daily tracker + report read the same number.
  const autoWorkingDays = monthWorkingDays(period)
  const overrideRaw = drafts.workingDaysOverride !== undefined ? drafts.workingDaysOverride : d.workingDaysOverride
  const hasOverride = overrideRaw != null && String(overrideRaw).trim() !== '' && parseNum(overrideRaw) > 0
  const effWorkingDays = hasOverride ? parseNum(overrideRaw) : autoWorkingDays
  useEffect(() => {
    if (effWorkingDays && d.workingDays !== effWorkingDays) updatePeriodData(period, { workingDays: effWorkingDays })
  }, [period, effWorkingDays]) // eslint-disable-line react-hooks/exhaustive-deps

  // Derived targets
  const branchTarget = parseNum(num('dailyTarget')) * effWorkingDays
  const bvTarget     = branchTarget - parseNum(num('bdbMonthlyTarget'))

  // Net turnover (per person)
  const bvG   = parseNum(num('bvGross'))
  const bdbG  = parseNum(num('bdbGross'))
  const ded   = parseNum(num('transitCover')) + parseNum(num('discounts'))
  const bvN   = netTurnover(bvG,  bvG, bdbG, parseNum(num('transitCover')), parseNum(num('discounts')))
  const bdbN  = netTurnover(bdbG, bvG, bdbG, parseNum(num('transitCover')), parseNum(num('discounts')))
  const netBranch = bvG + bdbG - ded

  // Salesman payouts
  const bvOwn    = bvOwnComm(bvG, bvN)
  const bdbOwn   = bdbOwnComm(bdbG, bdbN)
  const helper   = helperBonus(bvG, bdbG)
  const bbBV     = branchBonus(bvG, bdbG, branchTarget)
  const bbBDB    = branchBonus(bvG, bdbG, branchTarget)
  const bvTotal  = bvOwn + helper + bbBV
  const bdbTotal = bdbOwn + bbBDB

  // Warehouse
  const whRate  = whPerPersonRate(netBranch)
  const wh      = parseNum(num('whHeadcount'))
  const whTotal = whRate * wh
  const wDays   = effWorkingDays
  const whDailyRate = wDays > 0 ? whRate / wDays : 0

  // Amy
  const amyGP       = parseNum(num('amyGP'))
  const amyCalc     = amyBonus(amyGP)
  const amyTopUp    = parseNum(num('amyTopUp'))
  const amyFinal    = amyCalc + amyTopUp

  // The exact values currently in the form (drafts included), for saving without
  // waiting on React state to flush — this is what gets persisted.
  const currentPayload = () => ({
    ...d,
    dailyTarget: parseNum(num('dailyTarget')),
    bdbMonthlyTarget: parseNum(num('bdbMonthlyTarget')),
    workingDays: effWorkingDays,
    workingDaysOverride: hasOverride ? parseNum(overrideRaw) : null,
    transitCover: parseNum(num('transitCover')),
    discounts: parseNum(num('discounts')),
    bvGross: bvG,
    bdbGross: bdbG,
    whHeadcount: wh,
    amyGP,
    amyTopUp,
  })

  // Categorised users
  const bvUser  = users.find(u => u.commissionRole === 'bv')
  const bdbUser = users.find(u => u.commissionRole === 'bdb')
  const amyUser = users.find(u => u.commissionRole === 'amy')
  const whUsers = users.filter(u => u.commissionRole === 'warehouse')

  const handleSave = async () => {
    setSaving(true)
    const res = await saveCommissionPeriod(period, me.name, currentPayload())
    setSaving(false)
    setToast(res?.ok ? { ok: true, msg: `Saved ${formatPeriod(period)}.` } : { ok: false, msg: res?.error || 'Save failed.' })
  }

  // Save just the monthly targets so they stay static across daily imports.
  const handleSaveTargets = async () => {
    setSavingTargets(true)
    const res = await saveCommissionPeriod(period, me.name, currentPayload())
    setSavingTargets(false)
    setToast(res?.ok ? { ok: true, msg: `Targets saved for ${formatPeriod(period)}.` } : { ok: false, msg: res?.error || 'Save failed.' })
  }

  const handleClearMonth = async () => {
    if (!window.confirm(`Clear all saved data for ${formatPeriod(period)}? This can't be undone.`)) return
    setDrafts({}); setImp(null); setImpErr('')
    const res = await clearCommissionPeriod(period)
    setToast(res?.ok ? { ok: true, msg: `Cleared ${formatPeriod(period)}.` } : { ok: false, msg: res?.error || 'Clear failed.' })
  }

  // Drop the daily pivot straight into Commission — turnover flows into the
  // calculations below and shows a quick summary. (Amy is excluded.)
  const handleCommUpload = async (file) => {
    if (!file) return
    setImpErr('')
    try {
      const res = await parsePivotFile(file)
      if (res.error) { setImpErr(res.error); return }
      const bv = res.reps.find(r => r.role === 'bv')
      const bdb = res.reps.find(r => r.role === 'bdb')
      const patch = {}
      if (bv) patch.bvGross = bv.cumulative
      if (bdb) patch.bdbGross = bdb.cumulative
      // Drop stale drafts so the turnover inputs show the freshly imported values.
      setDrafts(prev => { const n = { ...prev }; delete n.bvGross; delete n.bdbGross; return n })
      if (Object.keys(patch).length) upd(patch)
      setImp({ bv: bv?.cumulative ?? null, bdb: bdb?.cumulative ?? null,
        total: res.reps.find(r => r.role === 'total')?.cumulative ?? null, fileDate: res.fileDate })
    } catch (e) { setImpErr('Could not read the file.') }
  }

  const handleSendMonthEnd = async () => {
    const payouts = []
    if (bvUser?.email) payouts.push({
      userId: bvUser.id, userName: bvUser.name, email: bvUser.email, role: 'BV',
      breakdown: { 'Own commission (3% above R500k net)': bvOwn, 'Helper bonus': helper, 'Branch target bonus': bbBV },
      total: bvTotal,
    })
    if (bdbUser?.email) payouts.push({
      userId: bdbUser.id, userName: bdbUser.name, email: bdbUser.email, role: 'BDB',
      breakdown: { 'Own commission (3% above R500k net)': bdbOwn, 'Branch target bonus': bbBDB },
      total: bdbTotal,
    })
    whUsers.forEach(u => {
      if (!u.email) return
      const absDays = absVal(u.id)
      const deduction = whDailyRate * absDays
      const final = Math.max(0, whRate - deduction)
      payouts.push({
        userId: u.id, userName: u.name, email: u.email, role: 'Warehouse',
        breakdown: { 'Warehouse incentive': whRate, 'Absent day deduction': -deduction },
        total: final,
      })
    })
    if (amyUser?.email) payouts.push({
      userId: amyUser.id, userName: amyUser.name, email: amyUser.email, role: 'Marketing',
      breakdown: { 'GP bonus': amyCalc, 'Discretionary top-up': amyTopUp },
      total: amyFinal,
    })
    if (!payouts.length) { setToast({ ok: false, msg: 'No employees have email addresses set up.' }); return }
    setSending(true)
    const res = await sendMonthEndPayouts(period, payouts, me.name)
    setSending(false)
    if (res?.ok) {
      updatePeriodData(period, { finalizedAt: new Date().toISOString(), finalizedBy: me.name })
      setToast({ ok: true, msg: `Month-end emails sent to ${res.sent} person(s).${res.note ? ' ' + res.note : ''}` })
    } else setToast({ ok: false, msg: res?.error || 'Send failed.' })
  }

  const handleSaveRoles = async () => {
    setRolesSaving(true)
    for (const [id, role] of Object.entries(roleDrafts)) {
      await updateUser(Number(id), { commissionRole: role })
    }
    setRoleDrafts({})
    setRolesSaving(false)
    setToast({ ok: true, msg: 'Commission roles saved.' })
  }

  const fieldCls = 'w-full px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#FECD28]/60'

  return (
    <div className="space-y-5">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodNav period={period} onChange={setPeriod} />
        <div className="flex flex-wrap items-center gap-2">
          <Toast msg={toast?.msg} ok={toast?.ok} onClose={() => setToast(null)} />
          <button onClick={handleClearMonth} title="Clear all saved data for this month"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
            <Trash2 size={14}/> Clear
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-slate-800 dark:bg-slate-700 text-white hover:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-40 transition-colors">
            <Save size={14}/> {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={handleSendMonthEnd} disabled={sending}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-black bg-[#FECD28] hover:bg-[#f0c020] disabled:opacity-40 transition-colors">
            <Send size={14}/> {sending ? 'Sending…' : 'Finalise & send'}
          </button>
        </div>
      </div>

      {d.finalizedAt && (
        <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 rounded-lg border border-emerald-200 dark:border-emerald-800">
          <Check size={13}/> Month-end emails sent by {d.finalizedBy} on {new Date(d.finalizedAt).toLocaleDateString('en-ZA')}.
        </div>
      )}

      {/* Team setup (collapsible) */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <button onClick={() => setShowSetup(s => !s)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors">
          <span className="flex items-center gap-2"><Settings size={14}/> Team commission roles</span>
          <span className="text-xs text-slate-400">{showSetup ? 'Hide ▲' : 'Show ▼'}</span>
        </button>
        {showSetup && (
          <div className="border-t border-slate-100 dark:border-slate-700 p-4 space-y-3">
            <p className="text-xs text-slate-400">Assign each person their commission role — only needs to be done once.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {users.map(u => (
                <div key={u.id} className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200 w-28 flex-shrink-0">{u.name}</span>
                  <select
                    value={roleDrafts[u.id] !== undefined ? roleDrafts[u.id] : (u.commissionRole || '')}
                    onChange={e => setRoleDrafts(p => ({ ...p, [u.id]: e.target.value }))}
                    className={fieldCls}>
                    {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <button onClick={handleSaveRoles} disabled={!Object.keys(roleDrafts).length || rolesSaving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-[#FECD28] text-black hover:bg-[#f0c020] disabled:opacity-40 transition-colors">
              <Save size={13}/> {rolesSaving ? 'Saving…' : 'Save roles'}
            </button>
            {(!bvUser || !bdbUser) && (
              <p className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-1.5"><Info size={12} className="mt-0.5 flex-shrink-0"/> Assign BV and BDB roles above to enable the salesman section.</p>
            )}
          </div>
        )}
      </div>

      {/* Daily pivot upload — feeds turnover straight into the calcs below */}
      <Card title="Drop in the daily pivot file" icon={Upload} accent>
        <p className="text-xs text-slate-400 mb-3">Drop today's SMART IT export (BrendonV / BrendonD / Grand Total). BV & BDB turnover fill in below and the whole breakdown updates. <span className="font-medium text-slate-500 dark:text-slate-300">Amy is excluded.</span> Re-drop any time to overwrite; hit <span className="font-medium">Save</span> to store the month.</p>
        <div onDrop={e => { e.preventDefault(); handleCommUpload(e.dataTransfer.files[0]) }} onDragOver={e => e.preventDefault()}
          onClick={() => commFileRef.current?.click()}
          className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl px-6 py-5 text-center cursor-pointer hover:border-[#FECD28] hover:bg-[#FECD28]/5 transition-colors">
          <Upload size={20} className="mx-auto mb-1.5 text-slate-400"/>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Drop .xlsx or .csv here, or click to browse</p>
          <input ref={commFileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => handleCommUpload(e.target.files[0])}/>
        </div>
        {impErr && <p className="mt-2 text-xs text-red-500 flex items-center gap-1"><AlertCircle size={12}/> {impErr}</p>}
        {imp && (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 bg-emerald-50/60 dark:bg-emerald-900/15 rounded-lg p-3">
            <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 col-span-2 sm:col-span-1">
              <Check size={13}/> Imported{imp.fileDate ? ` · ${new Date(imp.fileDate).toLocaleDateString('en-ZA', { day:'2-digit', month:'short' })}` : ''}
            </div>
            <Stat label={`${bvUser?.name || 'BV'} turnover`} value={fmtRInt(imp.bv)} />
            <Stat label={`${bdbUser?.name || 'BDB'} turnover`} value={fmtRInt(imp.bdb)} />
            <Stat label="Total (excl. Amy)" value={fmtRInt(imp.total)} />
          </div>
        )}
      </Card>

      {/* Monthly targets — saved separately so they stay static all month */}
      <Card title="Monthly targets" icon={TrendingUp}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
          {[
            { label: 'Daily target (R)', key: 'dailyTarget' },
            { label: "BDB's monthly target (R)", key: 'bdbMonthlyTarget' },
          ].map(({ label, key }) => (
            <div key={key}>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">{label}</label>
              <NumInput
                value={drafts[key] !== undefined ? drafts[key] : d[key]}
                onChange={v => setDraft(key, v)}
                onBlur={() => commitDraft(key)}
              />
            </div>
          ))}
          <div>
            <label className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
              <span>Working days {hasOverride ? '(manual)' : '(auto)'}</span>
              {hasOverride && (
                <button type="button" onClick={() => { setDraft('workingDaysOverride', ''); upd({ workingDaysOverride: null }) }}
                  className="text-[11px] font-medium text-[#b8960a] dark:text-[#FECD28] hover:underline">↺ auto ({autoWorkingDays})</button>
              )}
            </label>
            <NumInput prefix=""
              value={drafts.workingDaysOverride !== undefined ? drafts.workingDaysOverride : (d.workingDaysOverride ?? autoWorkingDays)}
              onChange={v => setDraft('workingDaysOverride', v)}
              onBlur={() => { const raw = drafts.workingDaysOverride; if (raw !== undefined) { const v = String(raw).trim() === '' ? null : parseNum(raw); upd({ workingDaysOverride: v }); setDrafts(p => { const n = { ...p }; delete n.workingDaysOverride; return n }) } }}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-700/30 rounded-lg p-3 mb-3">
          <Stat label="Total branch target" value={fmtRInt(branchTarget)} highlight />
          <Stat label="BV target (auto)" value={fmtRInt(bvTarget)} />
        </div>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-slate-400 flex items-center gap-1.5">
            <Info size={11}/> Working days auto-count Mon–Fri minus SA public holidays — edit the field to override. Save targets once; they stay fixed while you drop in the daily file.
          </p>
          <button onClick={handleSaveTargets} disabled={savingTargets}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-black bg-[#FECD28] hover:bg-[#f0c020] disabled:opacity-40 transition-colors">
            <Save size={14}/> {savingTargets ? 'Saving…' : 'Save targets'}
          </button>
        </div>
      </Card>

      {/* Branch-wide deductions */}
      <Card title="Branch-wide deductions" icon={null}>
        <div className="grid grid-cols-2 gap-4 mb-4">
          {[
            { label: 'Transit cover (R)', key: 'transitCover' },
            { label: 'Discounts (R)',     key: 'discounts' },
          ].map(({ label, key }) => (
            <div key={key}>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">{label}</label>
              <NumInput value={drafts[key] !== undefined ? drafts[key] : d[key]} onChange={v => setDraft(key, v)} />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 bg-slate-50 dark:bg-slate-700/30 rounded-lg p-3">
          <Stat label="Total deductions" value={fmtRInt(ded)} />
          <Stat label="Net branch (BV+BDB)" value={fmtRInt(netBranch)} />
          <Stat label="BV net turnover" value={fmtRInt(bvN)} />
        </div>
      </Card>

      {/* Salesman commission */}
      <Card title={`Salesman commission — ${bvUser?.name || 'BV'} & ${bdbUser?.name || 'BDB'}`} icon={TrendingUp} accent>
        <div className="grid grid-cols-2 gap-4 mb-5">
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">{bvUser?.name || 'BV'} gross turnover (R)</label>
            <NumInput value={drafts['bvGross'] !== undefined ? drafts['bvGross'] : d.bvGross} onChange={v => setDraft('bvGross', v)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">{bdbUser?.name || 'BDB'} gross turnover (R)</label>
            <NumInput value={drafts['bdbGross'] !== undefined ? drafts['bdbGross'] : d.bdbGross} onChange={v => setDraft('bdbGross', v)} />
          </div>
        </div>

        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-xs text-slate-400 border-b border-slate-100 dark:border-slate-700">
              <td className="pb-2"/>
              <td className="pb-2 text-right font-semibold text-slate-600 dark:text-slate-300">{bvUser?.name || 'BV'}</td>
              <td className="pb-2 text-right font-semibold text-slate-600 dark:text-slate-300">{bdbUser?.name || 'BDB'}</td>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
            {[
              { label: 'Net turnover',                          bv: fmtRInt(bvN),    bdb: fmtRInt(bdbN) },
              { label: 'Own commission (3% above R500k net)',   bv: fmtRInt(bvOwn),  bdb: fmtRInt(bdbOwn) },
              { label: 'Helper bonus (BV only, both >R500k)',   bv: fmtRInt(helper), bdb: '—' },
              { label: 'Branch target bonus',                   bv: fmtRInt(bbBV),   bdb: fmtRInt(bbBDB) },
            ].map(row => (
              <tr key={row.label} className="text-slate-700 dark:text-slate-300">
                <td className="py-1.5 pr-4 text-xs text-slate-500 dark:text-slate-400">{row.label}</td>
                <td className="py-1.5 text-right font-mono text-sm">{row.bv}</td>
                <td className="py-1.5 text-right font-mono text-sm">{row.bdb}</td>
              </tr>
            ))}
            <tr className="font-semibold text-slate-900 dark:text-slate-100 border-t border-slate-200 dark:border-slate-600">
              <td className="pt-3 pr-4 text-sm">Total payout</td>
              <td className="pt-3 text-right font-mono text-base text-[#b8960a] dark:text-[#FECD28]">{fmtRInt(bvTotal)}</td>
              <td className="pt-3 text-right font-mono text-base text-[#b8960a] dark:text-[#FECD28]">{fmtRInt(bdbTotal)}</td>
            </tr>
          </tbody>
        </table>

        {(bvG > 0 || bdbG > 0) && bvG + bdbG <= branchTarget && branchTarget > 1000000 && (
          <p className="mt-3 text-xs text-amber-600 dark:text-amber-400 flex items-start gap-1.5">
            <Info size={12} className="mt-0.5 flex-shrink-0"/>
            Combined ({fmtRInt(bvG+bdbG)}) is {fmtRInt(branchTarget - bvG - bdbG)} short of the branch target — no branch bonus yet.
          </p>
        )}
      </Card>

      {/* Warehouse */}
      <Card title="Warehouse incentive" icon={Users}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Headcount</label>
            <NumInput prefix="" value={drafts['whHeadcount'] !== undefined ? drafts['whHeadcount'] : d.whHeadcount} onChange={v => setDraft('whHeadcount', v)} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 bg-slate-50 dark:bg-slate-700/30 rounded-lg p-3 mb-4">
          <Stat label="Net branch turnover" value={fmtRInt(netBranch)} />
          <Stat label="Per-person rate" value={fmtRInt(whRate)} highlight={whRate > 0} />
          <Stat label="Team total" value={fmtRInt(whTotal)} />
        </div>

        {whUsers.length > 0 ? (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-xs text-slate-400 border-b border-slate-100 dark:border-slate-700">
                <td className="pb-2">Person</td>
                <td className="pb-2 text-center">Sick / absent days</td>
                <td className="pb-2 text-right">Deduction</td>
                <td className="pb-2 text-right">Final incentive</td>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
              {whUsers.map(u => {
                const absDays  = absVal(u.id)
                const deduction = whDailyRate * absDays
                const final    = Math.max(0, whRate - deduction)
                return (
                  <tr key={u.id} className="text-slate-700 dark:text-slate-300">
                    <td className="py-2 pr-4 font-medium">{u.name}</td>
                    <td className="py-2 text-center">
                      <input type="number" min="0" value={absDays}
                        onChange={e => setAbs(u.id, e.target.value)}
                        className="w-16 text-center px-2 py-1 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-[#FECD28]/60"/>
                    </td>
                    <td className="py-2 text-right text-red-500 dark:text-red-400 font-mono text-sm">{deduction > 0 ? `−${fmtRInt(deduction)}` : '—'}</td>
                    <td className="py-2 text-right font-mono text-sm font-semibold text-[#b8960a] dark:text-[#FECD28]">{fmtRInt(final)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <p className="text-xs text-slate-400 text-center py-2">Assign "Warehouse" role to employees in Team setup above.</p>
        )}

        {netBranch > 0 && netBranch <= 600000 && (
          <p className="mt-3 text-xs text-slate-400 flex items-center gap-1.5"><Info size={12}/> Net branch turnover is at or below R600k — no warehouse incentive this period.</p>
        )}
        {netBranch > 1250000 && (
          <p className="mt-3 text-xs text-slate-400 flex items-center gap-1.5"><Info size={12}/> Rate is capped at R4,000 per person above R1.25m.</p>
        )}
      </Card>

      {/* Amy */}
      <Card title={`${amyUser?.name || 'Amy'} — Marketing incentive`} icon={Gift}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Gross profit (GP) for the month (R)</label>
            <NumInput value={drafts['amyGP'] !== undefined ? drafts['amyGP'] : d.amyGP} onChange={v => setDraft('amyGP', v)} />
          </div>
          <div className="flex items-end">
            <div className="bg-slate-50 dark:bg-slate-700/30 rounded-lg px-4 py-2.5 flex-1">
              <p className="text-xs text-slate-400 mb-0.5">Calculated GP bonus</p>
              <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{fmtRInt(amyCalc)}</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Discretionary top-up (R)</label>
            <NumInput value={drafts['amyTopUp'] !== undefined ? drafts['amyTopUp'] : d.amyTopUp} onChange={v => setDraft('amyTopUp', v)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Top-up note (optional)</label>
            <input type="text" placeholder="Reason for top-up…" value={d.amyTopUpNote || ''}
              onChange={e => upd({ amyTopUpNote: e.target.value })}
              className="w-full px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#FECD28]/60"/>
          </div>
        </div>
        <div className="bg-slate-50 dark:bg-slate-700/30 rounded-lg p-3">
          <Stat label="Total payout" value={fmtRInt(amyFinal)} highlight />
        </div>
      </Card>
    </div>
  )
}

// ── Daily Tracker tab ─────────────────────────────────────────────────────────

function DailyTrackerTab({ period, setPeriod }) {
  const { users, user: me } = useAuth()
  const { getPeriodData, updatePeriodData, saveCommissionPeriod, sendDailyProgress } = useIncentives()
  const d = getPeriodData(period)

  const [daysElapsed, setDaysElapsed]  = useState(String(new Date().getDate()))
  const [uploadedReps, setUploadedReps] = useState(null)  // [{ rawName, cumulative }]
  const [importedFileDate, setImportedFileDate] = useState(null)
  const [uploadError, setUploadError]   = useState('')
  const [sending, setSending]           = useState(false)
  const [saving, setSaving]             = useState(false)
  const [downloading, setDownloading]   = useState(false)
  const [toast, setToast]               = useState(null)
  const fileRef = useRef()

  // When a dated file is imported, derive working days elapsed (1st → file date).
  useEffect(() => {
    if (!importedFileDate) return
    const [y, m] = importedFileDate.split('-').map(Number)
    const first = `${y}-${String(m).padStart(2, '0')}-01`
    const elapsed = workingDays(first, importedFileDate)
    if (elapsed > 0) setDaysElapsed(String(elapsed))
  }, [importedFileDate])

  // Feed the imported cumulative BV/BDB turnover into the month's commission figures
  // (overwrites on every fresh import). Amy is excluded so she never lands here.
  useEffect(() => {
    if (!uploadedReps) return
    const bv  = uploadedReps.find(r => r.role === 'bv')
    const bdb = uploadedReps.find(r => r.role === 'bdb')
    const patch = {}
    if (bv)  patch.bvGross  = bv.cumulative
    if (bdb) patch.bdbGross = bdb.cumulative
    if (Object.keys(patch).length) updatePeriodData(period, patch)
  }, [uploadedReps]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveMonth = async () => {
    setSaving(true)
    const res = await saveCommissionPeriod(period, me.name)
    setSaving(false)
    setToast(res?.ok
      ? { ok: true, msg: `Saved ${formatPeriod(period)} — figures written to the month.` }
      : { ok: false, msg: res?.error || 'Save failed.' })
  }

  const bvUser  = users.find(u => u.commissionRole === 'bv')
  const bdbUser = users.find(u => u.commissionRole === 'bdb')

  // Parse turnover file via the shared parser, then show the progress table.
  const handleFile = useCallback(async (file) => {
    if (!file) return
    setUploadError(''); setUploadedReps(null)
    try {
      const res = await parsePivotFile(file)
      if (res.error) { setUploadError(res.error); return }
      setUploadedReps(res.reps)
      setImportedFileDate(res.fileDate)
    } catch (err) {
      console.error(err)
      setUploadError('Could not read file: ' + String(err.message || err))
    }
  }, [])

  const onDrop  = (e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]) }
  const onDragOver = (e) => e.preventDefault()

  const days = parseNum(daysElapsed) || 1
  const wDays = d.workingDays || monthWorkingDays(period)
  const bvTarget  = (d.dailyTarget || 0) * wDays - (d.bdbMonthlyTarget || 0)
  const bdbTarget = d.bdbMonthlyTarget || 0

  const bvRow  = uploadedReps?.find(r => r.role === 'bv')
  const bdbRow = uploadedReps?.find(r => r.role === 'bdb')
  const totalRow = uploadedReps?.find(r => r.role === 'total')

  const branchMonthlyTarget = (d.dailyTarget || 0) * wDays

  const buildRepsForExport = () => {
    const reps = []
    if (bvRow)    reps.push({ name: bvUser?.name || 'BV',               cumulative: bvRow.cumulative,    monthlyTarget: bvTarget,             email: bvUser?.email  || '' })
    if (bdbRow)   reps.push({ name: bdbUser?.name || 'BDB',             cumulative: bdbRow.cumulative,   monthlyTarget: bdbTarget,            email: bdbUser?.email || '' })
    if (totalRow) reps.push({ name: 'Grand Total (excl. Amy)',           cumulative: totalRow.cumulative, monthlyTarget: branchMonthlyTarget,  email: '', isTotal: true })
    return reps
  }

  const handleDownloadPdf = async () => {
    const reps = buildRepsForExport()
    if (!reps.length) { setToast({ ok: false, msg: 'No rep data to download.' }); return }
    setDownloading(true)
    try {
      await downloadDailyProgressPdf({ period, date: new Date().toISOString().slice(0, 10), daysElapsed: days, workingDays: wDays, reps, users })
    } catch (err) {
      setToast({ ok: false, msg: 'PDF failed: ' + String(err.message || err) })
    }
    setDownloading(false)
  }

  const handleSendDailyEmail = async () => {
    const reps = buildRepsForExport()
    if (!reps.length) { setToast({ ok: false, msg: 'No rep data to send.' }); return }
    setSending(true)
    const res = await sendDailyProgress(period, { daysElapsed: days, workingDays: wDays, date: new Date().toISOString().slice(0,10), reps }, me.name)
    setSending(false)
    setToast(res?.ok ? { ok: true, msg: `Daily email sent to ${res.sent} recipient(s).${res.note ? ' '+res.note : ''}` } : { ok: false, msg: res?.error || 'Send failed.' })
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodNav period={period} onChange={setPeriod} />
        <Toast msg={toast?.msg} ok={toast?.ok} onClose={() => setToast(null)} />
      </div>

      {/* Context from saved targets */}
      {d.dailyTarget > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <Stat label="Branch target" value={fmtRInt((d.dailyTarget||0)*wDays)} />
          <Stat label="BV target" value={fmtRInt(bvTarget)} />
          <Stat label="BDB target" value={fmtRInt(bdbTarget)} />
          <Stat label="Working days" value={wDays || '—'} />
        </div>
      )}
      {!d.dailyTarget && (
        <div className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-lg border border-amber-200 dark:border-amber-800">
          <Info size={12}/> Set monthly targets in the Commission tab first.
        </div>
      )}

      {/* Days elapsed */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-slate-600 dark:text-slate-300">Days elapsed in month:</label>
        <input type="number" min="1" max={wDays} value={daysElapsed}
          onChange={e => setDaysElapsed(e.target.value)}
          className="w-20 px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-[#FECD28]/60"/>
        <span className="text-xs text-slate-400">of {wDays} working days</span>
        {importedFileDate && (
          <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
            <Check size={12}/> file dated {new Date(importedFileDate).toLocaleDateString('en-ZA', { day:'2-digit', month:'short', year:'numeric' })}
          </span>
        )}
      </div>

      {/* File upload */}
      <Card title="Upload SMART IT pivot export" icon={Upload}>
        <p className="text-xs text-slate-400 mb-3">Drop the daily .xlsx pivot file (BrendonV / BrendonD / Grand Total rows). Figures are cumulative month-to-date. <span className="font-medium text-slate-500 dark:text-slate-300">Amy is excluded</span> — her turnover is removed from the Grand Total. The date is read from the filename (DD-MM-YYYY).</p>
        <div onDrop={onDrop} onDragOver={onDragOver} onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl px-6 py-6 text-center cursor-pointer hover:border-[#FECD28] hover:bg-[#FECD28]/5 transition-colors">
          <Upload size={22} className="mx-auto mb-2 text-slate-400"/>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Drop .xlsx or .csv here, or click to browse</p>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => handleFile(e.target.files[0])}/>
        </div>
        {uploadError && <p className="mt-2 text-xs text-red-500 flex items-center gap-1"><AlertCircle size={12}/> {uploadError}</p>}
      </Card>

      {/* Progress table */}
      {uploadedReps && (
        <Card title={`Progress — ${formatPeriod(period)} (day ${days} of ${wDays})`} icon={TrendingUp} accent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-xs text-slate-400 border-b border-slate-200 dark:border-slate-700">
                  <td className="pb-2">Rep</td>
                  <td className="pb-2 text-right">Cumulative</td>
                  <td className="pb-2 text-right">Daily target</td>
                  <td className="pb-2 text-right">Ahead / Behind</td>
                  <td className="pb-2 text-right hidden sm:table-cell">Projected</td>
                  <td className="pb-2 text-right hidden md:table-cell">New daily rate</td>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
                {[
                  bvRow  && { label: bvUser?.name  || 'BV',  cum: bvRow.cumulative,  target: bvTarget  },
                  bdbRow && { label: bdbUser?.name || 'BDB', cum: bdbRow.cumulative, target: bdbTarget },
                  totalRow && { label: 'Grand Total (excl. Amy)', cum: totalRow.cumulative, target: (d.dailyTarget||0)*wDays },
                ].filter(Boolean).map(({ label, cum, target }) => {
                  const m = repMetrics(cum, target, days, wDays)
                  const ahead = m.delta >= 0
                  return (
                    <tr key={label} className="text-slate-700 dark:text-slate-300">
                      <td className="py-2 font-semibold">{label}</td>
                      <td className="py-2 text-right font-mono">{fmtRInt(cum)}</td>
                      <td className="py-2 text-right font-mono text-slate-400">{fmtRInt(m.dailyTarget)}</td>
                      <td className={`py-2 text-right font-mono font-semibold ${ahead ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                        {ahead ? '+' : '−'}{fmtRInt(Math.abs(m.delta))}
                      </td>
                      <td className="py-2 text-right font-mono hidden sm:table-cell">{fmtRInt(m.projected)}</td>
                      <td className="py-2 text-right font-mono hidden md:table-cell">{fmtRInt(m.newDailyRate)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button onClick={handleSaveMonth} disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-black bg-[#FECD28] hover:bg-[#f0c020] disabled:opacity-40 transition-colors">
              <Save size={14}/> {saving ? 'Saving…' : 'Save to month'}
            </button>
            <button onClick={handleDownloadPdf} disabled={downloading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-black bg-[#FECD28] hover:bg-[#f0c020] disabled:opacity-40 transition-colors">
              <Download size={14}/> {downloading ? 'Generating…' : 'Download PDF'}
            </button>
            <button onClick={handleSendDailyEmail} disabled={sending}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-slate-800 dark:bg-slate-700 hover:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-40 transition-colors">
              <Mail size={14}/> {sending ? 'Sending…' : 'Send daily progress email'}
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-400 flex items-center gap-1.5">
            <Info size={11}/> "Save to month" writes BV/BDB turnover into {formatPeriod(period)}'s Commission figures (re-import to overwrite). Daily email goes to all salesmen + admins with email addresses on file.
          </p>
        </Card>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function IncentivesPage() {
  const [tab, setTab]       = useState('commission')
  const [period, setPeriod] = useState(currentPeriod)

  const tabCls = (t) =>
    `px-4 py-2 text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 ${
      tab === t ? 'bg-[#FECD28] text-black' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
    }`

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Gift size={22} className="text-[#FECD28]"/> Incentives & Commission
        </h1>
        <div className="flex gap-2">
          <button className={tabCls('commission')} onClick={() => setTab('commission')}>
            <TrendingUp size={15}/> Commission
          </button>
          <button className={tabCls('daily')} onClick={() => setTab('daily')}>
            <Upload size={15}/> Daily Tracker
          </button>
          <button className={tabCls('reports')} onClick={() => setTab('reports')}>
            <FileText size={15}/> Reports
          </button>
        </div>
      </div>

      {tab === 'commission' ? <CommissionTab period={period} setPeriod={setPeriod} />
        : tab === 'daily'   ? <DailyTrackerTab period={period} setPeriod={setPeriod} />
        : <IncentiveReportTab />
      }
    </div>
  )
}
