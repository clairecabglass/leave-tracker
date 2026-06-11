// Leave-balance maths. Kept separate from the store so it's easy to swap for
// server-side numbers later. All "taken" figures count APPROVED requests only.
//
// Admins can nudge a balance via per-user adjustment fields (annualAdjust,
// sickAdjust, familyAdjust) — a +/- number of days folded into the entitlement.
import { STATUS } from './context/LeaveContext'

const ANNUAL_RATE = 1.25       // days accrued per full month worked
const SICK_ENTITLEMENT = 30    // days per 3-year cycle
const SICK_CYCLE_YEARS = 3
const FAMILY_ENTITLEMENT = 3   // days per calendar year

export function monthsWorked(startDate, now = new Date()) {
  if (!startDate) return 0
  const s = new Date(startDate)
  if (isNaN(s)) return 0
  let m = (now.getFullYear() - s.getFullYear()) * 12 + (now.getMonth() - s.getMonth())
  if (now.getDate() < s.getDate()) m -= 1
  return Math.max(0, m)
}

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

const num = (v) => Number(v) || 0

// Full balance picture for one user (entitlements include admin adjustments).
export function balancesFor(user, requests, now = new Date()) {
  const annualAdjust = num(user.annualAdjust)
  const accrued = +(monthsWorked(user.startDate, now) * ANNUAL_RATE + annualAdjust).toFixed(2)
  const annualTaken = approvedDays(requests, user.id, 'Annual')

  const cycleStart = currentSickCycleStart(user.startDate, now)
  const sickEntitlement = SICK_ENTITLEMENT + num(user.sickAdjust)
  const sickTaken = approvedDays(requests, user.id, 'Sick', cycleStart)

  const yearStart = new Date(now.getFullYear(), 0, 1)
  const familyEntitlement = FAMILY_ENTITLEMENT + num(user.familyAdjust)
  const familyTaken = approvedDays(requests, user.id, 'Family Responsibility', yearStart)

  return {
    annual: { accrued, taken: annualTaken, remaining: +(accrued - annualTaken).toFixed(2), rate: ANNUAL_RATE },
    sick:   { entitlement: sickEntitlement, taken: sickTaken, remaining: sickEntitlement - sickTaken, cycleStart },
    family: { entitlement: familyEntitlement, taken: familyTaken, remaining: familyEntitlement - familyTaken },
    unpaid: { taken: approvedDays(requests, user.id, 'Unpaid') },
    other:  { taken: approvedDays(requests, user.id, 'Other') },
  }
}

// Base entitlements (default rules) so the Admin panel can express "remaining"
// as an adjustment: adjust = desiredRemaining - (currentRemaining - currentAdjust).
export const RULES = { ANNUAL_RATE, SICK_ENTITLEMENT, FAMILY_ENTITLEMENT }
