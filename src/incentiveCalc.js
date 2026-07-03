// Commission / incentive calculation engine. Pure functions shared by the
// Incentives page (live calculators) and the date-range report PDF so the two
// can never drift apart. All formulas validated against the historical workbook.

// Net turnover per salesperson: proportional share of branch-wide deductions.
export function netTurnover(gross, bvGross, bdbGross, transitCover, discounts) {
  const combined = bvGross + bdbGross
  const totalDed = transitCover + discounts
  const share = combined > 0 ? gross / combined : 0
  return gross - totalDed * share
}

// BDB own commission: 3% above R500k of NET, only if GROSS > R500k.
export function bdbOwnComm(bdbGross, bdbNet) {
  if (bdbGross <= 500000) return 0
  return Math.max(0, (bdbNet - 500000) * 0.03)
}
// BV own commission: 3% above R500k of NET − R7,500, only if GROSS > R500k.
export function bvOwnComm(bvGross, bvNet) {
  if (bvGross <= 500000) return 0
  return Math.max(0, (bvNet - 500000) * 0.03 - 7500)
}
// Helper bonus: BV only, R8,500 when BOTH are above R500k gross.
export function helperBonus(bvGross, bdbGross) {
  return bvGross > 500000 && bdbGross > 500000 ? 8500 : 0
}
// Branch target bonus: R2,500 each when combined gross > branch target AND branch target > R1m.
export function branchBonus(bvGross, bdbGross, branchTarget) {
  return bvGross + bdbGross > branchTarget && branchTarget > 1000000 ? 2500 : 0
}

// Warehouse per-person rate from the live spreadsheet formula (net branch turnover).
// Nested-IF table, caps at R4,000 above R1.25m; R0 at/below R600k.
export function whPerPersonRate(net) {
  if (net > 1250000) return 4000
  if (net > 1200000) return 3750
  if (net > 1150000) return 3500
  if (net > 1100000) return 3250
  if (net > 1050000) return 3000
  if (net > 1000000) return 2750
  if (net > 950000)  return 2500
  if (net > 900000)  return 2200
  if (net > 850000)  return 1900
  if (net > 800000)  return 1600
  if (net > 750000)  return 1350
  if (net > 700000)  return 1100
  if (net > 650000)  return 850
  if (net > 600000)  return 600
  return 0
}

// Amy GP tiered bonus.
export function amyBonus(gp) {
  if (gp > 1000000) return 16000 + Math.floor((gp - 1000000) / 50000) * 1000
  if (gp > 950000)  return 15000
  if (gp > 900000)  return 14000
  if (gp > 850000)  return 13000
  if (gp > 800000)  return 12000
  if (gp > 750000)  return 11000
  if (gp > 700000)  return 10000
  if (gp > 650000)  return 9000
  if (gp > 600000)  return 8000
  if (gp > 550000)  return 5500
  if (gp > 500000)  return 4500
  if (gp > 450000)  return 3500
  if (gp > 400000)  return 2500
  return 0
}

// Daily tracker metrics per rep.
export function repMetrics(cumulative, monthlyTarget, daysElapsed, workingDaysCount) {
  const dailyTarget  = workingDaysCount > 0 ? monthlyTarget / workingDaysCount : 0
  const expected     = dailyTarget * daysElapsed
  const delta        = cumulative - expected
  const projected    = daysElapsed > 0 ? (cumulative / daysElapsed) * workingDaysCount : 0
  const daysLeft     = workingDaysCount - daysElapsed
  const newDailyRate = daysLeft > 0 ? Math.max(0, (monthlyTarget - cumulative) / daysLeft) : 0
  return { dailyTarget, expected, delta, projected, newDailyRate }
}

const n = (v) => { const x = Number(v); return isNaN(x) ? 0 : x }

// Roll one saved period's data (`d`) + the user list into a full computed result:
// per-person payouts, branch summary, and turnover figures. Used by the report.
export function computePeriod(d, users) {
  const dailyTarget = n(d.dailyTarget), wDays = n(d.workingDays) || 20
  const branchTarget = dailyTarget * wDays
  const bvGross = n(d.bvGross), bdbGross = n(d.bdbGross)
  const transitCover = n(d.transitCover), discounts = n(d.discounts)
  const ded = transitCover + discounts
  const bvNet  = netTurnover(bvGross,  bvGross, bdbGross, transitCover, discounts)
  const bdbNet = netTurnover(bdbGross, bvGross, bdbGross, transitCover, discounts)
  const netBranch = bvGross + bdbGross - ded

  const bvOwn  = bvOwnComm(bvGross, bvNet)
  const bdbOwn = bdbOwnComm(bdbGross, bdbNet)
  const helper = helperBonus(bvGross, bdbGross)
  const bb     = branchBonus(bvGross, bdbGross, branchTarget)
  const bvTotal  = bvOwn + helper + bb
  const bdbTotal = bdbOwn + bb

  const whRate = whPerPersonRate(netBranch)
  const whDailyRate = wDays > 0 ? whRate / wDays : 0
  const whUsers = (users || []).filter(u => u.commissionRole === 'warehouse')
  const warehouse = whUsers.map(u => {
    const abs = n(d.absences?.[u.id])
    const deduction = whDailyRate * abs
    return { id: u.id, name: u.name, abs, deduction, final: Math.max(0, whRate - deduction) }
  })
  const whTeamTotal = warehouse.reduce((s, w) => s + w.final, 0)

  const amyGP = n(d.amyGP), amyCalc = amyBonus(amyGP), amyTopUp = n(d.amyTopUp)
  const amyFinal = amyCalc + amyTopUp

  const totalIncentives = bvTotal + bdbTotal + whTeamTotal + amyFinal

  return {
    branchTarget, bvTarget: branchTarget - n(d.bdbMonthlyTarget), wDays,
    bvGross, bdbGross, combinedGross: bvGross + bdbGross,
    ded, bvNet, bdbNet, netBranch,
    bv:  { own: bvOwn,  helper, branch: bb, total: bvTotal },
    bdb: { own: bdbOwn, branch: bb, total: bdbTotal },
    whRate, warehouse, whTeamTotal,
    amy: { gp: amyGP, calc: amyCalc, topUp: amyTopUp, final: amyFinal },
    totalIncentives,
  }
}
