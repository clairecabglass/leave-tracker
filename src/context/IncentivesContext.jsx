import { createContext, useContext, useState, useEffect } from 'react'
import {
  LIVE, fetchData,
  apiSetIncentive, apiBulkSendIncentives, apiSendSalesReport,
  apiSaveCommissionPeriod, apiSendMonthEndPayouts, apiSendDailyProgress,
} from '../api'

const IncentivesContext = createContext(null)

const INCENTIVES_KEY  = 'leave_incentives'
const COMMISSION_KEY  = 'leave_commission'

function loadList(key) {
  try { const r = localStorage.getItem(key); if (r) { const l = JSON.parse(r); if (Array.isArray(l)) return l } } catch {}
  return []
}
function loadObj(key) {
  try { const r = localStorage.getItem(key); if (r) return JSON.parse(r) } catch {}
  return {}
}

// Default period state — admin fills these in.
export function defaultPeriodData() {
  return {
    dailyTarget: 0, workingDays: 20, bdbMonthlyTarget: 0,
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

  useEffect(() => { localStorage.setItem(INCENTIVES_KEY,  JSON.stringify(incentives))        }, [incentives])
  useEffect(() => { localStorage.setItem(COMMISSION_KEY, JSON.stringify(commissionPeriods)) }, [commissionPeriods])

  const refresh = async () => {
    if (!LIVE) return
    try {
      const data = await fetchData()
      if (data?.incentives)  setIncentives(data.incentives)
      if (data?.commission)  setCommissionPeriods(data.commission)
    } catch (err) { console.error('Load incentives failed:', err) }
  }
  useEffect(() => { refresh() }, [])

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

  const saveCommissionPeriod = async (period, updatedBy) => {
    const payload = commissionPeriods[period] ?? defaultPeriodData()
    if (LIVE) {
      const res = await apiSaveCommissionPeriod(period, payload, updatedBy)
      if (res?.ok) refresh()
      return res
    }
    return { ok: true }
  }

  const sendMonthEndPayouts = async (period, payouts, sentBy) => {
    if (LIVE) return await apiSendMonthEndPayouts(period, payouts, sentBy)
    return { ok: true, sent: payouts.length, note: 'Mock mode — no emails sent.' }
  }

  const sendDailyProgress = async (period, progress, sentBy) => {
    if (LIVE) return await apiSendDailyProgress(period, progress, sentBy)
    return { ok: true, sent: 0, note: 'Mock mode — no emails sent.' }
  }

  return (
    <IncentivesContext.Provider value={{
      incentives, saveIncentive, bulkSendIncentives, sendSalesReport, refresh,
      commissionPeriods, getPeriodData, updatePeriodData, saveCommissionPeriod,
      sendMonthEndPayouts, sendDailyProgress,
    }}>
      {children}
    </IncentivesContext.Provider>
  )
}

export function useIncentives() { return useContext(IncentivesContext) }
