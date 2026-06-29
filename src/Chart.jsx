import { useState } from 'react'
import { BASE_RATING } from './storage.js'
import { recentWeeks, weekShortLabel, weekLabel, compareWeeks } from './week.js'

// Number of weeks shown on the x axis.
const WINDOW = 12

// Palette pulled from CSS variables so colors adapt to light and dark mode.
const COLOR_VARS = [
  '--series-1',
  '--series-2',
  '--series-3',
  '--series-4',
  '--series-5',
  '--series-6',
  '--series-7',
  '--series-8',
]

export function seriesColor(index) {
  return `var(${COLOR_VARS[index % COLOR_VARS.length]})`
}

// Compute the cumulative rating for a metric at the end of each visible week.
// The earliest visible week already reflects all prior accumulated adjustments
// so the line is continuous.
function buildSeries(state, metric, visibleWeeks) {
  // Sum of all adjustments strictly before the first visible week.
  const firstWeek = visibleWeeks[0]
  let priorTotal = BASE_RATING
  for (const [weekKey, entry] of Object.entries(state.weeks)) {
    if (compareWeeks(weekKey, firstWeek) < 0) {
      const d = entry[metric.id]
      if (Number.isFinite(d)) priorTotal += d
    }
  }

  const points = []
  let running = priorTotal
  for (const weekKey of visibleWeeks) {
    const entry = state.weeks[weekKey]
    const d = entry && Number.isFinite(entry[metric.id]) ? entry[metric.id] : 0
    running += d
    points.push(running)
  }
  return points
}

export default function Chart({ state, metrics, endWeek }) {
  const [hidden, setHidden] = useState(() => new Set())
  const [singleId, setSingleId] = useState('all')
  const [hover, setHover] = useState(null)

  const visibleWeeks = recentWeeks(endWeek, WINDOW)

  // Does any adjustment exist at all?
  const hasData = Object.keys(state.weeks).length > 0

  // Which metrics are actually drawn.
  const drawnMetrics = metrics.filter((m) => {
    if (singleId !== 'all') return m.id === singleId
    return !hidden.has(m.id)
  })

  const seriesByMetric = metrics.map((m) => ({
    metric: m,
    points: buildSeries(state, m, visibleWeeks),
  }))

  // Y range across drawn series, with padding.
  let minY = Infinity
  let maxY = -Infinity
  for (const s of seriesByMetric) {
    if (!drawnMetrics.includes(s.metric)) continue
    for (const p of s.points) {
      if (p < minY) minY = p
      if (p > maxY) maxY = p
    }
  }
  if (!Number.isFinite(minY)) {
    minY = BASE_RATING - 10
    maxY = BASE_RATING + 10
  }
  if (minY === maxY) {
    minY -= 5
    maxY += 5
  }
  const pad = (maxY - minY) * 0.1
  minY -= pad
  maxY += pad

  // viewBox coordinate space. The SVG scales to the container via width 100%.
  const VB_W = 720
  const VB_H = 320
  const M = { top: 16, right: 16, bottom: 36, left: 48 }
  const plotW = VB_W - M.left - M.right
  const plotH = VB_H - M.top - M.bottom

  const n = visibleWeeks.length
  const xFor = (i) =>
    M.left + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW)
  const yFor = (v) =>
    M.top + plotH - ((v - minY) / (maxY - minY)) * plotH

  // Horizontal grid lines and labels.
  const ticks = 4
  const gridLines = []
  for (let t = 0; t <= ticks; t++) {
    const value = minY + ((maxY - minY) * t) / ticks
    gridLines.push({ value: Math.round(value), y: yFor(value) })
  }

  function toggleMetric(id) {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (!hasData) {
    return (
      <section className="chart-card" aria-label="Weekly ratings chart">
        <h2>Weekly trend</h2>
        <div className="chart-empty">
          <p>No adjustments yet.</p>
          <p>Nudge a metric up or down to start building your trend line.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="chart-card" aria-label="Weekly ratings chart">
      <div className="chart-header">
        <h2>Weekly trend</h2>
        <label className="chart-mode">
          <span className="sr-only">Choose which metrics to show</span>
          <select
            value={singleId}
            onChange={(e) => setSingleId(e.target.value)}
            aria-label="Show all metrics or a single metric"
          >
            <option value="all">All metrics</option>
            {metrics.map((m) => (
              <option key={m.id} value={m.id}>
                Only: {m.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="chart-svg-wrap">
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          width="100%"
          role="img"
          aria-label="Line chart of metric ratings over the most recent weeks"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Grid lines and y labels */}
          {gridLines.map((g, i) => (
            <g key={i}>
              <line
                x1={M.left}
                x2={VB_W - M.right}
                y1={g.y}
                y2={g.y}
                className="grid-line"
              />
              <text x={M.left - 8} y={g.y + 4} className="axis-label" textAnchor="end">
                {g.value}
              </text>
            </g>
          ))}

          {/* X axis labels: show a subset to avoid crowding */}
          {visibleWeeks.map((w, i) => {
            const show = n <= 6 || i % 2 === 0 || i === n - 1
            if (!show) return null
            return (
              <text
                key={w}
                x={xFor(i)}
                y={VB_H - 12}
                className="axis-label"
                textAnchor="middle"
              >
                {weekShortLabel(w)}
              </text>
            )
          })}

          {/* Series lines and points */}
          {seriesByMetric.map((s) => {
            if (!drawnMetrics.includes(s.metric)) return null
            const idx = metrics.indexOf(s.metric)
            const color = seriesColor(idx)
            const path = s.points
              .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(p)}`)
              .join(' ')
            return (
              <g key={s.metric.id}>
                {n > 1 && (
                  <path d={path} fill="none" stroke={color} strokeWidth="2.5" />
                )}
                {s.points.map((p, i) => (
                  <circle
                    key={i}
                    cx={xFor(i)}
                    cy={yFor(p)}
                    r={hover && hover.mi === idx && hover.wi === i ? 6 : 3.5}
                    fill={color}
                    className="data-point"
                    tabIndex={0}
                    role="button"
                    aria-label={`${s.metric.name}, ${weekLabel(
                      visibleWeeks[i],
                    )}, rating ${p}`}
                    onMouseEnter={() =>
                      setHover({ mi: idx, wi: i, x: xFor(i), y: yFor(p), value: p })
                    }
                    onMouseLeave={() => setHover(null)}
                    onFocus={() =>
                      setHover({ mi: idx, wi: i, x: xFor(i), y: yFor(p), value: p })
                    }
                    onBlur={() => setHover(null)}
                    onClick={() =>
                      setHover({ mi: idx, wi: i, x: xFor(i), y: yFor(p), value: p })
                    }
                  />
                ))}
              </g>
            )
          })}

          {/* Tooltip */}
          {hover &&
            (() => {
              const metric = metrics[hover.mi]
              const wk = visibleWeeks[hover.wi]
              const boxW = 150
              const boxH = 46
              let tx = hover.x + 10
              if (tx + boxW > VB_W) tx = hover.x - boxW - 10
              let ty = hover.y - boxH - 10
              if (ty < M.top) ty = hover.y + 12
              return (
                <g className="tooltip" pointerEvents="none">
                  <rect x={tx} y={ty} width={boxW} height={boxH} rx="6" />
                  <text x={tx + 8} y={ty + 17} className="tt-title">
                    {metric.name}
                  </text>
                  <text x={tx + 8} y={ty + 33} className="tt-sub">
                    {weekShortLabel(wk)} &middot; rating {hover.value}
                  </text>
                </g>
              )
            })()}
        </svg>
      </div>

      {/* Legend with per metric toggles */}
      <ul className="legend">
        {metrics.map((m, idx) => {
          const isHidden = singleId === 'all' && hidden.has(m.id)
          const disabled = singleId !== 'all' && singleId !== m.id
          return (
            <li key={m.id}>
              <button
                type="button"
                className={`legend-item${isHidden || disabled ? ' off' : ''}`}
                onClick={() => toggleMetric(m.id)}
                disabled={singleId !== 'all'}
                aria-pressed={!isHidden}
                aria-label={`Toggle ${m.name} in chart`}
              >
                <span
                  className="swatch"
                  style={{ background: seriesColor(idx) }}
                  aria-hidden="true"
                />
                {m.name}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
