import { useEffect, useMemo, useRef, useState } from 'react'
import {
  loadState,
  saveState,
  clearAll,
  ratingFor,
  progressFor,
  makeId,
  BASE_RATING,
  DEFAULT_TARGET,
  SCORES,
  START_LEVELS,
} from './storage.js'
import {
  currentWeekString,
  shiftWeek,
  weekLabel,
  compareWeeks,
} from './week.js'
import Chart from './Chart.jsx'

// Apply the effective theme to the document root.
function applyTheme(theme) {
  const root = document.documentElement
  let effective = theme
  if (theme === 'system') {
    effective = window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
  }
  root.setAttribute('data-theme', effective)
}

export default function App() {
  const [state, setState] = useState(loadState)
  const [week, setWeek] = useState(currentWeekString)
  const [editing, setEditing] = useState(false)
  const fileInputRef = useRef(null)

  const thisWeek = currentWeekString()
  const atCurrentWeek = compareWeeks(week, thisWeek) >= 0
  const displayName = state.settings.name.trim()
  const checkedIn = !!state.checkins[week]
  const completedCount = Object.keys(state.checkins).length

  // Persist on every change.
  useEffect(() => {
    saveState(state)
  }, [state])

  // Apply theme and react to OS changes while on "system".
  useEffect(() => {
    applyTheme(state.settings.theme)
    if (state.settings.theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyTheme('system')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [state.settings.theme])

  const orderedMetrics = useMemo(
    () => [...state.metrics].sort((a, b) => a.order - b.order),
    [state.metrics],
  )

  // Score the selected week's outcome for a metric. Choosing the outcome that
  // is already selected clears it back to unscored.
  function setScore(metricId, value) {
    setState((prev) => {
      const weeks = { ...prev.weeks }
      const entry = { ...(weeks[week] || {}) }
      if (entry[metricId] === value) delete entry[metricId]
      else entry[metricId] = value
      if (Object.keys(entry).length === 0) delete weeks[week]
      else weeks[week] = entry
      return { ...prev, weeks }
    })
  }

  function setTheme(theme) {
    setState((prev) => ({ ...prev, settings: { ...prev.settings, theme } }))
  }

  function setName(name) {
    setState((prev) => ({ ...prev, settings: { ...prev.settings, name } }))
  }

  // Update a numeric metric field (baseline or target). Empty input is
  // tolerated while typing and coerced to a sensible number.
  function setMetricNumber(id, field, raw) {
    const value = raw === '' ? 0 : Math.trunc(Number(raw))
    if (!Number.isFinite(value)) return
    setState((prev) => ({
      ...prev,
      metrics: prev.metrics.map((m) =>
        m.id === id ? { ...m, [field]: value } : m,
      ),
    }))
  }

  // Set a metric's baseline from a tangible starting level. Keep the target
  // above the new baseline so the progress bar stays meaningful.
  function setBaselineLevel(id, value) {
    setState((prev) => ({
      ...prev,
      metrics: prev.metrics.map((m) =>
        m.id === id
          ? { ...m, baseline: value, target: m.target > value ? m.target : value + 100 }
          : m,
      ),
    }))
  }

  // Jump back one week so the user can backfill a previous week's outcomes.
  function scorePreviousWeek() {
    setWeek((w) => shiftWeek(w, -1))
    setEditing(false)
  }

  // Flip whether the selected week's check-in is marked complete.
  function toggleCheckin() {
    setState((prev) => {
      const checkins = { ...prev.checkins }
      if (checkins[week]) delete checkins[week]
      else checkins[week] = true
      return { ...prev, checkins }
    })
  }

  function cycleTheme() {
    const order = ['light', 'dark', 'system']
    const i = order.indexOf(state.settings.theme)
    setTheme(order[(i + 1) % order.length])
  }

  // Metric editing operations.
  function addMetric() {
    setState((prev) => {
      const maxOrder = prev.metrics.reduce((m, x) => Math.max(m, x.order), -1)
      return {
        ...prev,
        metrics: [
          ...prev.metrics,
          {
            id: makeId(),
            name: 'New metric',
            order: maxOrder + 1,
            baseline: BASE_RATING,
            target: DEFAULT_TARGET,
          },
        ],
      }
    })
  }

  function renameMetric(id, name) {
    setState((prev) => ({
      ...prev,
      metrics: prev.metrics.map((m) => (m.id === id ? { ...m, name } : m)),
    }))
  }

  function deleteMetric(id) {
    setState((prev) => {
      const weeks = {}
      for (const [wk, entry] of Object.entries(prev.weeks)) {
        const copy = { ...entry }
        delete copy[id]
        if (Object.keys(copy).length > 0) weeks[wk] = copy
      }
      return {
        ...prev,
        metrics: prev.metrics.filter((m) => m.id !== id),
        weeks,
      }
    })
  }

  // Move a metric up or down in display order by swapping order values.
  function moveMetric(id, direction) {
    setState((prev) => {
      const sorted = [...prev.metrics].sort((a, b) => a.order - b.order)
      const idx = sorted.findIndex((m) => m.id === id)
      const swapWith = idx + direction
      if (swapWith < 0 || swapWith >= sorted.length) return prev
      const a = sorted[idx]
      const b = sorted[swapWith]
      const metrics = prev.metrics.map((m) => {
        if (m.id === a.id) return { ...m, order: b.order }
        if (m.id === b.id) return { ...m, order: a.order }
        return m
      })
      return { ...prev, metrics }
    })
  }

  // Export all data as a downloadable JSON file. Uses an in memory blob, so
  // there is no network request.
  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'metrics-elo-export.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  function importData(event) {
    const file = event.target.files && event.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result))
        // Round trip through the loader's normalizer by saving then loading.
        saveState(parsed)
        setState(loadState())
      } catch (err) {
        alert('Could not import that file. It does not look like valid data.')
      }
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  // Full reset: clear everything this app stored in the browser, then reload so
  // the app starts fresh from the seeded defaults.
  function fullReset() {
    if (
      !window.confirm(
        'Full reset? This permanently clears all data for this app from this browser and restores the default metrics.',
      )
    ) {
      return
    }
    clearAll()
    window.location.reload()
  }

  const themeLabel = { light: 'Light', dark: 'Dark', system: 'System' }[
    state.settings.theme
  ]

  return (
    <div className="app">
      <header className="header">
        <div className="title-block">
          <h1>Metrics ELO</h1>
          <p className="tagline">
            {displayName
              ? `${displayName}'s weekly check-in`
              : 'Your weekly check-in'}
            : the person you were vs the person you are becoming.
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="ghost"
            onClick={() => setEditing((v) => !v)}
            aria-pressed={editing}
          >
            {editing ? 'Done' : 'Edit metrics'}
          </button>
          <button
            type="button"
            className="ghost"
            onClick={cycleTheme}
            aria-label={`Theme: ${themeLabel}. Click to change.`}
          >
            Theme: {themeLabel}
          </button>
          <button
            type="button"
            className="ghost danger"
            onClick={fullReset}
            aria-label="Full reset: clear all data and restore defaults"
          >
            Reset
          </button>
        </div>
      </header>

      <div className="week-bar">
        <button
          type="button"
          className="arrow"
          onClick={() => setWeek((w) => shiftWeek(w, -1))}
          aria-label="Previous week"
        >
          &larr;
        </button>
        <span className="week-label" aria-live="polite">
          {weekLabel(week)}
        </span>
        <button
          type="button"
          className="arrow"
          onClick={() => setWeek((w) => shiftWeek(w, 1))}
          disabled={atCurrentWeek}
          aria-label="Next week"
        >
          &rarr;
        </button>
      </div>

      <div className="checkin-bar">
        <button
          type="button"
          className={`checkin-toggle${checkedIn ? ' done' : ''}`}
          onClick={toggleCheckin}
          aria-pressed={checkedIn}
          aria-label={
            checkedIn
              ? 'Mark this week as not checked in'
              : 'Mark this week as checked in'
          }
        >
          {checkedIn ? '✓ Checked in for this week' : 'Mark check-in complete'}
        </button>
        <span className="checkin-count">
          {completedCount} {completedCount === 1 ? 'week' : 'weeks'} checked in
        </span>
      </div>

      {editing && (
        <section className="editor" aria-label="Edit metrics and profile">
          <label className="name-field">
            <span>Your name (shown on the check-in)</span>
            <input
              type="text"
              value={state.settings.name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Optional"
              aria-label="Your display name"
            />
          </label>

          <p className="editor-hint">
            Pick a starting level for who you were before, and a target rating
            for who you are becoming. Each card shows how far you have travelled
            between them. To set history from before you started, use "Score a
            previous week" and score earlier weeks with the normal outcomes.
          </p>

          <ul className="editor-list">
            {orderedMetrics.map((m, i) => (
              <li key={m.id} className="editor-row">
                <div className="editor-row-head">
                  <input
                    type="text"
                    className="metric-name-input"
                    value={m.name}
                    onChange={(e) => renameMetric(m.id, e.target.value)}
                    aria-label={`Rename metric ${m.name}`}
                  />
                  <div className="editor-row-actions">
                  <button
                    type="button"
                    className="ghost small"
                    onClick={() => moveMetric(m.id, -1)}
                    disabled={i === 0}
                    aria-label={`Move ${m.name} up`}
                  >
                    &uarr;
                  </button>
                  <button
                    type="button"
                    className="ghost small"
                    onClick={() => moveMetric(m.id, 1)}
                    disabled={i === orderedMetrics.length - 1}
                    aria-label={`Move ${m.name} down`}
                  >
                    &darr;
                  </button>
                  <button
                    type="button"
                    className="ghost small danger"
                    onClick={() => deleteMetric(m.id)}
                    aria-label={`Delete ${m.name}`}
                  >
                    Delete
                  </button>
                  </div>
                </div>

                <div className="editor-row-config">
                  <div className="level-field">
                    <span className="field-label">Were</span>
                    <div
                      className="level-options"
                      role="group"
                      aria-label={`Starting level for ${m.name}`}
                    >
                      {START_LEVELS.map((lv) => (
                        <button
                          key={lv.key}
                          type="button"
                          className={`level${m.baseline === lv.value ? ' on' : ''}`}
                          aria-pressed={m.baseline === lv.value}
                          onClick={() => setBaselineLevel(m.id, lv.value)}
                          aria-label={`${lv.label}, rating ${lv.value}`}
                        >
                          {lv.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="num-field">
                    <span>Becoming</span>
                    <input
                      type="number"
                      value={m.target}
                      onChange={(e) =>
                        setMetricNumber(m.id, 'target', e.target.value)
                      }
                      aria-label={`Target rating for ${m.name}`}
                    />
                  </label>
                </div>
              </li>
            ))}
          </ul>
          <div className="editor-buttons">
            <button type="button" className="ghost" onClick={addMetric}>
              Add metric
            </button>
            <button type="button" className="ghost" onClick={scorePreviousWeek}>
              Score a previous week
            </button>
          </div>

          <div className="data-tools">
            <button type="button" className="ghost" onClick={exportData}>
              Export JSON
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => fileInputRef.current && fileInputRef.current.click()}
            >
              Import JSON
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              onChange={importData}
              className="sr-only"
              aria-label="Import data file"
            />
          </div>
        </section>
      )}

      <main className="cards">
        {orderedMetrics.map((m) => {
          const rating = ratingFor(state, m.id)
          const delta = (state.weeks[week] && state.weeks[week][m.id]) || 0
          const trend =
            delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
          const progress = progressFor(m, rating)
          const pct = progress === null ? null : Math.round(progress * 100)
          return (
            <article className="card" key={m.id}>
              <div className="card-top">
                <h2 className="metric-name">{m.name}</h2>
                <span
                  className={`trend trend-${trend}`}
                  aria-label={
                    trend === 'up'
                      ? 'Up this week'
                      : trend === 'down'
                        ? 'Down this week'
                        : 'No change this week'
                  }
                >
                  {trend === 'up' ? '▲' : trend === 'down' ? '▼' : '▬'}
                </span>
              </div>
              <div className="rating" aria-label={`Current rating ${rating}`}>
                {rating}
              </div>
              <div
                className="score-group"
                role="group"
                aria-label={`This week's outcome for ${m.name}`}
              >
                {SCORES.map((s) => {
                  const selected = delta === s.value
                  const sign = s.value > 0 ? `+${s.value}` : `${s.value}`
                  return (
                    <button
                      key={s.key}
                      type="button"
                      className={`score score-${s.key}${selected ? ' on' : ''}`}
                      aria-pressed={selected}
                      onClick={() => setScore(m.id, s.value)}
                      aria-label={`${s.label} for ${m.name}, ${sign} points`}
                    >
                      <span className="score-label">{s.label}</span>
                      <span className="score-value">{sign}</span>
                    </button>
                  )
                })}
              </div>

              <div className="becoming">
                <div className="becoming-ends">
                  <span>Were {m.baseline}</span>
                  <span>Becoming {m.target}</span>
                </div>
                {pct === null ? (
                  <p className="becoming-note">
                    Set a target above {m.baseline} to track who you are
                    becoming.
                  </p>
                ) : (
                  <>
                    <div
                      className="becoming-track"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={pct}
                      aria-label={`${m.name} progress from who you were to who you are becoming`}
                    >
                      <div
                        className="becoming-fill"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="becoming-note">
                      {pct >= 100
                        ? 'You have reached who you set out to become.'
                        : `${pct}% of the way to who you are becoming.`}
                    </p>
                  </>
                )}
              </div>
            </article>
          )
        })}
      </main>

      <Chart state={state} metrics={orderedMetrics} endWeek={thisWeek} />

      <footer className="footer">
        <p>
          All data is stored only in this browser's localStorage. There are no
          accounts and no network calls.
        </p>
      </footer>
    </div>
  )
}
