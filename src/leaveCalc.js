// Leave-balance maths. Kept separate from the store so it's easy to swap for
// server-side numbers later. All "taken" figures count APPROVED requests only.
import { STATUS } from './context/LeaveContext'

const ANNUAL_RATE = 1.25       // days accrued per full month worked
const SICK_ENTITLEMENT = 30    // days per 3-year cycle
const SICK_CYCLE_YEARS = 3

// Whole months between a start date and now (never negative).
export function monthsWorked(startDate, now = new Date()) {
  if (!startDate) return 0
  const s = new Date(startDate)
  if (isNaN(s)) return 0
  let m = (now.getFullYear() - s.getFullYear()) * 12 + (now.getMonth() - s.getMonth())
  if (now.getDate() < s.getDate()) m -= 1 // not a full month yet
  return Math.max(0, m)
}

// Start of the current 3-year sick cycle, anchored on the employment start date.
export function currentSickCycleStart(startDate, now = new Date()) {
  if (!startDate) return null
  const s = new Date(startDate)
  if (isNaN(s)) return null
  let cycle = new Date(s)
  while (true) {
    const next = new Date(cycle)
    next.setFullYear(next.getFullYear() + SICK_CYCLE_YEARS)
    if (next > now) break
    cycle = next
  }
  return cycle
}

function approvedDays(requests, userId, type, fromDate = null) {
  return requests
    .filter(r => r.employeeId === userId && r.type === type && r.status === STATUS.APPROVED)
    .filter(r => !fromDate || new Date(r.startDate) >= fromDate)
    .reduce((sum, r) => sum + (r.days || 0), 0)
}

// Full balance picture for one user.
export function balancesFor(user, requests, now = new Date()) {
  const accrued = +(monthsWorked(user.startDate, now) * ANNUAL_RATE).toFixed(2)
  const annualTaken = approvedDays(requests, user.id, 'Annual')
  const annualRemaining = +(accrued - annualTaken).toFixed(2)

  const cycleStart = currentSickCycleStart(user.startDate, now)
  const sickTaken = approvedDays(requests, user.id, 'Sick', cycleStart)
  const sickRemaining = SICK_ENTITLEMENT - sickTaken

  return {
    annual: { accrued, taken: annualTaken, remaining: annualRemaining, rate: ANNUAL_RATE },
    sick:   { entitlement: SICK_ENTITLEMENT, taken: sickTaken, remaining: sickRemaining, cycleStart },
    family: { taken: approvedDays(requests, user.id, 'Family Responsibility') },
    unpaid: { taken: approvedDays(requests, user.id, 'Unpaid') },
    other:  { taken: approvedDays(requests, user.id, 'Other') },
  }
}
