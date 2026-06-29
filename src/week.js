// ISO week helpers. No external date libraries.
//
// An ISO week string looks like "2026-W26". Weeks start on Monday.

const MS_PER_DAY = 24 * 60 * 60 * 1000
const MS_PER_WEEK = 7 * MS_PER_DAY

// Return the Monday (local time) of the week containing the given date.
function startOfISOWeek(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  // getDay: 0 (Sun) through 6 (Sat). Convert so Monday is 0.
  const day = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - day)
  return d
}

// Compute the ISO week-numbering year and week for a date.
// Based on the standard ISO 8601 algorithm.
function isoWeekParts(date) {
  // Work from the Thursday of the current week, which determines the year.
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - day + 3) // move to Thursday
  const isoYear = d.getFullYear()
  // First Thursday of the iso year.
  const firstThursday = new Date(isoYear, 0, 4)
  const firstDay = (firstThursday.getDay() + 6) % 7
  firstThursday.setDate(firstThursday.getDate() - firstDay + 3)
  const week = 1 + Math.round((d - firstThursday) / MS_PER_WEEK)
  return { isoYear, week }
}

// Convert a date to an ISO week string like "2026-W26".
export function isoWeekString(date) {
  const { isoYear, week } = isoWeekParts(date)
  return `${isoYear}-W${String(week).padStart(2, '0')}`
}

// The ISO week string for the current week.
export function currentWeekString() {
  return isoWeekString(new Date())
}

// Return the Monday Date object for a given ISO week string.
export function weekStringToDate(weekStr) {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekStr)
  if (!match) return startOfISOWeek(new Date())
  const isoYear = Number(match[1])
  const week = Number(match[2])
  // Monday of ISO week 1 is the Monday on or before Jan 4.
  const jan4 = new Date(isoYear, 0, 4)
  const monday1 = startOfISOWeek(jan4)
  const monday = new Date(monday1.getTime() + (week - 1) * MS_PER_WEEK)
  return monday
}

// Step a week string forward or backward by a number of weeks.
export function shiftWeek(weekStr, deltaWeeks) {
  const monday = weekStringToDate(weekStr)
  const shifted = new Date(monday.getTime() + deltaWeeks * MS_PER_WEEK)
  return isoWeekString(shifted)
}

// Human friendly label, e.g. "Week of 22 Jun 2026".
export function weekLabel(weekStr) {
  const monday = weekStringToDate(weekStr)
  const day = monday.getDate()
  const month = monday.toLocaleString('en-GB', { month: 'short' })
  const year = monday.getFullYear()
  return `Week of ${day} ${month} ${year}`
}

// Short label for chart axes, e.g. "22 Jun".
export function weekShortLabel(weekStr) {
  const monday = weekStringToDate(weekStr)
  const day = monday.getDate()
  const month = monday.toLocaleString('en-GB', { month: 'short' })
  return `${day} ${month}`
}

// Compare two ISO week strings chronologically. Returns negative, zero, or
// positive like a normal comparator.
export function compareWeeks(a, b) {
  return weekStringToDate(a).getTime() - weekStringToDate(b).getTime()
}

// Build an ordered list of the most recent `count` week strings ending at
// (and including) `endWeek`.
export function recentWeeks(endWeek, count) {
  const weeks = []
  for (let i = count - 1; i >= 0; i--) {
    weeks.push(shiftWeek(endWeek, -i))
  }
  return weeks
}
