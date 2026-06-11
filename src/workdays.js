// Working-day maths for South Africa: Mon–Fri minus public holidays.
// Leave is counted in working days, not calendar days.

const pad = (n) => String(n).padStart(2, '0')
export const isoLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const parseLocal = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d) }

// Easter Sunday (Anonymous Gregorian "computus").
function easter(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

const holidayCache = {}

// SA public holidays for a year as a Set of 'YYYY-MM-DD'. Includes the BCEA rule
// that a holiday falling on a Sunday is observed the following Monday.
export function saPublicHolidays(year) {
  if (holidayCache[year]) return holidayCache[year]
  const e = easter(year)
  const goodFriday = new Date(e); goodFriday.setDate(e.getDate() - 2)
  const familyDay = new Date(e); familyDay.setDate(e.getDate() + 1) // Easter Monday

  const fixed = [
    [0, 1],   // New Year's Day
    [2, 21],  // Human Rights Day
    [3, 27],  // Freedom Day
    [4, 1],   // Workers' Day
    [5, 16],  // Youth Day
    [7, 9],   // National Women's Day
    [8, 24],  // Heritage Day
    [11, 16], // Day of Reconciliation
    [11, 25], // Christmas Day
    [11, 26], // Day of Goodwill
  ].map(([m, d]) => new Date(year, m, d))

  const set = new Set()
  const add = (date) => {
    set.add(isoLocal(date))
    if (date.getDay() === 0) { // Sunday → observed Monday
      const mon = new Date(date); mon.setDate(date.getDate() + 1); set.add(isoLocal(mon))
    }
  }
  fixed.forEach(add)
  add(goodFriday)
  add(familyDay)
  holidayCache[year] = set
  return set
}

export function isWeekend(date) { const d = date.getDay(); return d === 0 || d === 6 }

export function isWorkingDay(date) {
  return !isWeekend(date) && !saPublicHolidays(date.getFullYear()).has(isoLocal(date))
}

// Working days between two ISO dates, inclusive. `half` makes a single working
// day count as 0.5 (used for half-day leave).
export function workingDays(startStr, endStr, half = false) {
  if (!startStr || !endStr) return 0
  const a = parseLocal(startStr), b = parseLocal(endStr)
  if (isNaN(a) || isNaN(b) || b < a) return 0
  let count = 0
  for (let d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
    if (isWorkingDay(d)) count++
  }
  if (half && count === 1) return 0.5
  return count
}
