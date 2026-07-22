import { createContext, useContext, useState, useEffect } from 'react'
import {
  LIVE, fetchData,
  apiSetIncentive, apiBulkSendIncentives, apiSendSalesReport,
  apiSaveCommissionPeriod, apiClearCommissionPeriod, apiSendMonthEndPayouts, apiSendDailyProgress,
  apiSaveSettings, apiSendAuditorReport, apiGetPayslipPasswords, apiSendPayslips,
} from '../api'

const IncentivesContext = createContext(null)

const INCENTIVES_KEY  = 'leave_incentives'
const COMMISSION_KEY  = 'leave_commission'
const SETTINGS_KEY    = 'leave_settings'

// Admin-configurable settings (auditor email + Pabbly mail hooks).
export function defaultSettings() {
  return { auditorEmail: '', incentiveHook: '', leaveHook: '', accountantEmail: '' }
}

function loadList(key) {
  try { const r = localStorage.getItem(key); if (r) { const l = JSON.parse(r); if (Array.isArray(l)) return l } } catch {}
  return []
}
function loadObj(key) {
  try { const r = localStorage.getItem(key); if (r) return JSON.parse(r) } catch {}
  return {}
}

// Normalise a commission period key to 'YYYY-MM'. Google Sheets can coerce the
// stored "2026-07" into a Date, which reads back as "Wed Jul 01 2026 …". This
// recovers the canonical month key so lookups/saves work regardless of backend.
function toYM(k) {
  const m = String(k).match(/^(\d{4})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}`
  const d = new Date(k)
  return isNaN(d) ? String(k) : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function normalizeCommission(obj) {
  const out = {}
  for (const [k, v] of Object.entries(obj || {})) out[toYM(k)] = v
  return out
}

// Default period state — admin fills these in.
export function defaultPeriodData() {
  return {
    dailyTarget: 0, workingDays: 20, workingDaysOverride: null, bdbMonthlyTarget: 0,
    transitCover: 0, discounts: 0,
    bvGross: 0, bdbGross: 0,
    whHeadcount: 3,
    absences: {},
    amyGP: 0, amyTopUp: 0, amyTopUpNote: '',
    finalizedAt: null, finalizedBy: null,
  }
}

export function IncentivesProvider({ children }) {
  const [incentives,        setIncentives]        = useState(() => loadList(INCENTIVES_KEY))
  const [commissionPeriods, setCommissionPeriods] = useState(() => loadObj(COMMISSION_KEY))
  const [settings,          setSettings]          = useState(() => ({ ...defaultSettings(), ...loadObj(SETTINGS_KEY) }))

  useEffect(() => { localStorage.setItem(INCENTIVES_KEY,  JSON.stringify(incentives))        }, [incentives])
  useEffect(() => { localStorage.setItem(COMMISSION_KEY, JSON.stringify(commissionPeriods)) }, [commissionPeriods])
  useEffect(() => { localStorage.setItem(SETTINGS_KEY,   JSON.stringify(settings))          }, [settings])

  const refresh = async () => {
    if (!LIVE) return
    try {
      const data = await fetchData()
      if (data?.incentives)  setIncentives(data.incentives)
      if (data?.commission)  setCommissionPeriods(normalizeCommission(data.commission))
      if (data?.settings)    setSettings(s => ({ ...defaultSettings(), ...data.settings }))
    } catch (err) { console.error('Load incentives failed:', err) }
  }
  useEffect(() => { refresh() }, [])

  // Optimistic settings save (admin only).
  const saveSettings = async (patch, updatedBy) => {
    setSettings(s => ({ ...s, ...patch }))
    if (LIVE) { const res = await apiSaveSettings(patch, updatedBy); if (res?.error) refresh(); return res }
    return { ok: true }
  }

  // Email the date-range report to the auditors (+ the incentive Pabbly hook).
  // Backend reads the auditor address and hook from saved settings.
  const sendAuditorReport = async ({ from, to, base64, fileName, sentBy }) => {
    if (LIVE) return await apiSendAuditorReport({ from, to, base64, fileName, sentBy })
    return { ok: true, note: 'Mock mode — no email sent.' }
  }

  // ── Generic incentives (legacy bulk per-user per-period) ──
  const saveIncentive = (record) => {
    const rec = { id: Date.now(), emailedAt: '', ...record, setAt: new Date().toISOString() }
    setIncentives(prev => {
      const idx = prev.findIndex(i => i.userId === record.userId && i.period === record.period)
      if (idx >= 0) { const n = [...prev]; n[idx] = { ...prev[idx], ...rec, id: prev[idx].id }; return n }
      return [rec, ...prev]
    })
    if (LIVE) apiSetIncentive(rec).then(refresh).catch(e => console.error('Set incentive failed:', e))
  }

  const bulkSendIncentives = async (period, sentBy) => {
    if (LIVE) {
      const res = await apiBulkSendIncentives(period, sentBy)
      if (res?.ok) { setIncentives(prev => prev.map(i => i.period === period ? { ...i, emailedAt: new Date().toISOString() } : i)); refresh() }
      return res
    }
    setIncentives(prev => prev.map(i => i.period === period ? { ...i, emailedAt: new Date().toISOString() } : i))
    return { ok: true, sent: 0, note: 'Mock mode — no emails sent.' }
  }

  const sendSalesReport = async (salesData, period, sentBy) => {
    if (LIVE) return await apiSendSalesReport(salesData, period, sentBy)
    return { ok: true, sent: salesData.length, note: 'Mock mode — no emails sent.' }
  }

  // ── Commission periods ──
  const getPeriodData = (period) => commissionPeriods[period] ?? defaultPeriodData()

  const updatePeriodData = (period, patch) => {
    setCommissionPeriods(prev => ({
      ...prev,
      [period]: { ...(prev[period] ?? defaultPeriodData()), ...patch },
    }))
  }

  // `explicitPayload` lets the caller pass the exact values to save, avoiding the
  // stale-state race where an edit hasn't flushed into commissionPeriods yet.
  const saveCommissionPeriod = async (period, updatedBy, explicitPayload) => {
    const payload = explicitPayload ?? commissionPeriods[period] ?? defaultPeriodData()
    if (explicitPayload) updatePeriodData(period, explicitPayload) // keep local state in sync
    if (LIVE) {
      const res = await apiSaveCommissionPeriod(period, payload, updatedBy)
      if (res?.ok) refresh()
      return res
    }
    return { ok: true }
  }

  // Wipe a month's saved commission data (local + server).
  const clearCommissionPeriod = async (period) => {
    setCommissionPeriods(prev => { const n = { ...prev }; delete n[period]; return n })
    if (LIVE) { const res = await apiClearCommissionPeriod(period); if (res?.error) refresh(); return res }
    return { ok: true }
  }

  const sendMonthEndPayouts = async (period, payouts, sentBy) => {
    if (LIVE) return await apiSendMonthEndPayouts(period, payouts, sentBy)
    return { ok: true, sent: payouts.length, note: 'Mock mode — no emails sent.' }
  }

  // Admin fetches per-user payslip passwords (to encrypt PDFs at finalise time).
  const getPayslipPasswords = async () => {
    if (LIVE) { const res = await apiGetPayslipPasswords(); return res?.passwords || {} }
    return {}
  }
  // Email each person their encrypted payslip PDF. items = [{ email, userName, fileName, base64 }]
  const sendPayslips = async (period, items, sentBy) => {
    if (LIVE) return await apiSendPayslips(period, items, sentBy)
    return { ok: true, sent: items.length, note: 'Mock mode — no emails sent.' }
  }

  const sendDailyProgress = async (period, progress, sentBy) => {
    if (LIVE) return await apiSendDailyProgress(period, progress, sentBy)
    return { ok: true, sent: 0, note: 'Mock mode — no emails sent.' }
  }

  return (
    <IncentivesContext.Provider value={{
      incentives, saveIncentive, bulkSendIncentives, sendSalesReport, refresh,
      commissionPeriods, getPeriodData, updatePeriodData, saveCommissionPeriod, clearCommissionPeriod,
      sendMonthEndPayouts, sendDailyProgress, getPayslipPasswords, sendPayslips,
      settings, saveSettings, sendAuditorReport,
    }}>
      {children}
    </IncentivesContext.Provider>
  )
}

export function useIncentives() { return useContext(IncentivesContext) }
