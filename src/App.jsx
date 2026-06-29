import { useEffect, useMemo, useRef, useState } from 'react'
import {
  loadState,
  saveState,
  clearState,
  seededState,
  ratingFor,
  makeId,
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

  // Adjust the selected week's delta for a metric by +1 or -1.
  function nudge(metricId, amount) {
    setState((prev) => {
      const weeks = { ...prev.weeks }
      const entry = { ...(weeks[week] || {}) }
      const next = (entry[metricId] || 0) + amount
      if (next === 0) delete entry[metricId]
      else entry[metricId] = next
      if (Object.keys(entry).length === 0) delete weeks[week]
      else weeks[week] = entry
      return { ...prev, weeks }
    })
  }

  function setTheme(theme) {
    setState((prev) => ({ ...prev, settings: { ...prev.settings, theme } }))
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
          { id: makeId(), name: 'New metric', order: maxOrder + 1 },
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

  function resetAll() {
    if (
      !window.confirm(
        'Reset all data? This clears every metric and adjustment from this browser.',
      )
    ) {
      return
    }
    clearState()
    const fresh = seededState()
    setState(fresh)
    setWeek(currentWeekString())
  }

  const themeLabel = { light: 'Light', dark: 'Dark', system: 'System' }[
    state.settings.theme
  ]

  return (
    <div className="app">
      <header className="header">
        <h1>Metrics ELO</h1>
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

      {editing && (
        <section className="editor" aria-label="Edit metrics">
          <ul className="editor-list">
            {orderedMetrics.map((m, i) => (
              <li key={m.id} className="editor-row">
                <input
                  type="text"
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
              </li>
            ))}
          </ul>
          <button type="button" className="ghost" onClick={addMetric}>
            Add metric
          </button>

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
            <button type="button" className="ghost danger" onClick={resetAll}>
              Reset all data
            </button>
          </div>
        </section>
      )}

      <main className="cards">
        {orderedMetrics.map((m) => {
          const rating = ratingFor(state, m.id)
          const delta = (state.weeks[week] && state.weeks[week][m.id]) || 0
          const trend =
            delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
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
              <div className="adjuster">
                <button
                  type="button"
                  className="step"
                  onClick={() => nudge(m.id, -1)}
                  aria-label={`Decrease ${m.name} for this week`}
                >
                  &minus;
                </button>
                <span
                  className={`delta delta-${trend}`}
                  aria-label={`This week's adjustment ${delta > 0 ? '+' : ''}${delta}`}
                >
                  {delta > 0 ? `+${delta}` : delta}
                </span>
                <button
                  type="button"
                  className="step"
                  onClick={() => nudge(m.id, 1)}
                  aria-label={`Increase ${m.name} for this week`}
                >
                  +
                </button>
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
