// All persistence lives here. The only storage mechanism is the browser's
// localStorage under a single versioned key. There are no network calls.

export const STORAGE_KEY = 'metrics-elo-v1'

export const BASE_RATING = 1000

// Default metrics seeded on first load.
const DEFAULT_METRIC_NAMES = [
  'Fitness',
  'Sleep',
  'Meal Prep',
  'Budgeting',
  'Intentional Relaxation',
]

// Generate a reasonably unique id without external dependencies.
export function makeId() {
  return 'm-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

// Default "becoming" target sits one growth step above the starting rating.
export const DEFAULT_TARGET = BASE_RATING + 100

export function seededState() {
  return {
    metrics: DEFAULT_METRIC_NAMES.map((name, index) => ({
      id: makeId(),
      name,
      order: index,
      // "Who you were before": the rating you are growing away from.
      baseline: BASE_RATING,
      // "Who you are becoming": the rating you are growing toward.
      target: DEFAULT_TARGET,
    })),
    weeks: {},
    // checkins maps an ISO week string to true once that week is marked done.
    checkins: {},
    settings: { theme: 'system', name: '' },
  }
}

// Validate and normalize an arbitrary parsed object into a well formed state.
// Anything missing or malformed falls back to safe defaults.
function normalize(parsed) {
  const fallback = seededState()
  if (!parsed || typeof parsed !== 'object') return fallback

  let metrics = Array.isArray(parsed.metrics) ? parsed.metrics : null
  if (!metrics) {
    metrics = fallback.metrics
  } else {
    metrics = metrics
      .filter((m) => m && typeof m.id === 'string' && typeof m.name === 'string')
      .map((m, index) => ({
        id: m.id,
        name: m.name,
        order: Number.isFinite(m.order) ? m.order : index,
        baseline: Number.isFinite(m.baseline) ? Math.trunc(m.baseline) : BASE_RATING,
        target: Number.isFinite(m.target) ? Math.trunc(m.target) : DEFAULT_TARGET,
      }))
    if (metrics.length === 0) metrics = fallback.metrics
  }

  const weeks = {}
  if (parsed.weeks && typeof parsed.weeks === 'object') {
    for (const [weekKey, value] of Object.entries(parsed.weeks)) {
      if (!value || typeof value !== 'object') continue
      const entry = {}
      for (const [metricId, delta] of Object.entries(value)) {
        const n = Number(delta)
        if (Number.isFinite(n) && n !== 0) entry[metricId] = Math.trunc(n)
      }
      if (Object.keys(entry).length > 0) weeks[weekKey] = entry
    }
  }

  const checkins = {}
  if (parsed.checkins && typeof parsed.checkins === 'object') {
    for (const [weekKey, value] of Object.entries(parsed.checkins)) {
      if (value) checkins[weekKey] = true
    }
  }

  const settingsIn = parsed.settings && typeof parsed.settings === 'object'
    ? parsed.settings
    : {}
  const theme = ['light', 'dark', 'system'].includes(settingsIn.theme)
    ? settingsIn.theme
    : 'system'
  const name = typeof settingsIn.name === 'string' ? settingsIn.name : ''

  return { metrics, weeks, checkins, settings: { theme, name } }
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return seededState()
    return normalize(JSON.parse(raw))
  } catch (err) {
    // Corrupt or unreadable storage. Start clean rather than crash.
    return seededState()
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (err) {
    // Storage may be full or blocked. Nothing else we can safely do.
  }
}

export function clearState() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch (err) {
    // Ignore.
  }
}

// Current overall rating for a metric: base plus the sum of every week's
// adjustment for that metric.
export function ratingFor(state, metricId) {
  let total = BASE_RATING
  for (const week of Object.values(state.weeks)) {
    const delta = week[metricId]
    if (Number.isFinite(delta)) total += delta
  }
  return total
}

// How far a metric has travelled from its baseline ("who you were") toward its
// target ("who you are becoming"). Returns a fraction clamped to 0..1, or null
// when the target is not above the baseline so a bar would be meaningless.
export function progressFor(metric, rating) {
  const span = metric.target - metric.baseline
  if (!Number.isFinite(span) || span <= 0) return null
  const fraction = (rating - metric.baseline) / span
  return Math.max(0, Math.min(1, fraction))
}
