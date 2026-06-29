# Metrics ELO

A small, local-only web app that tracks personal life metrics as ELO-style
ratings. Each metric starts at a base rating of 1000. You nudge metrics up or
down one point at a time, organized by week, and watch the ratings trend over
time on a hand-rolled line chart.

There is no backend, no account, no analytics, and no external services. Every
piece of data lives in your browser's `localStorage`.

## How it works

- Each metric has a rating that starts at 1000.
- The app is organized by ISO weeks. For any selected week you adjust a metric
  with the `+` and `-` buttons, each press changing that week's adjustment by
  exactly 1.
- A metric's current rating is `1000 + the sum of every week's net adjustment`
  for that metric.
- Earlier weeks, including the previous week, stay editable in the same
  1-point increments. You cannot navigate into the future past the current
  week.

Default metrics seeded on first load: Fitness, Sleep, Meal Prep, Budgeting,
Intentional Relaxation. You can add, rename, delete, and reorder metrics from
the "Edit metrics" panel. Deleting a metric also removes its data from every
week.

## Weekly check-in: who you were vs who you are becoming

The app frames each week as a check-in that compares the person you were before
with the person you are becoming.

- **Your name** is an optional display name shown on the check-in heading. It is
  stored locally and never sent anywhere.
- Each metric has a **baseline** ("who you were before") and a **target** ("who
  you are becoming"). Edit both in the "Edit metrics" panel. Each card shows a
  progress bar marking how far the current rating has travelled from the
  baseline toward the target.
- Each week can be **marked as a completed check-in**. A running count shows how
  many weeks you have checked in, and the selected week shows whether it is
  done.

## Data and privacy

All state is stored under a single versioned key, `metrics-elo-v1`, in
`localStorage`. The shape is:

- `metrics`: array of `{ id, name, order, baseline, target }`
- `weeks`: object keyed by ISO week string (for example `2026-W26`) mapping
  `metricId` to an integer delta for that week
- `checkins`: object keyed by ISO week string, set to `true` for each week
  marked as a completed check-in
- `settings`: `{ theme: "light" | "dark" | "system", name: string }`

Storage is parsed defensively. If the saved data is missing or corrupt, the app
falls back to the seeded defaults instead of crashing. State is persisted on
every change.

You can export all data to a JSON file and import it back from the edit panel.
A reset button clears everything behind a confirm dialog.

**Zero network calls.** The app makes no fetch, XHR, WebSocket, or any other
network request. Nothing is sent anywhere. The only persistence is
`localStorage`, and export/import uses in-browser file handling only.

## Local development

Requires Node.js 18 or newer.

```bash
npm install
npm run dev
```

Then open the local URL that Vite prints (usually http://localhost:5173).

## Build

```bash
npm run build
```

This produces a static site in the `dist` directory. You can preview the
production build locally with:

```bash
npm run preview
```

## Pushing to GitHub

```bash
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

## Deploying to Vercel

1. Push the repository to GitHub (see above).
2. In Vercel, choose "Add New Project" and import the GitHub repository.
3. Vercel detects Vite automatically. Confirm these settings:
   - Framework preset: **Vite**
   - Build command: **npm run build**
   - Output directory: **dist**
4. Deploy. Because the app is fully static and client-side, no environment
   variables or server configuration are needed.

## Tech

- Vite + React (plain JavaScript)
- No state libraries, no UI frameworks, no component libraries, no chart
  libraries
- Plain CSS with CSS variables for theming
- The chart is hand-rolled with inline SVG
