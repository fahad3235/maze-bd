# Maze BD — মেজ বিডি

Offline bilingual (EN/বাংলা) maze game. Every maze is generated from a seed with a seeded random walk, so any maze can be replayed or shared by its seed number. Play with arrow keys / WASD or the on-screen buttons, race the timer, and chase your best time per size.

## Features

- **Seeded maze generation** — recursive-backtracker mazes that are always perfect (exactly one path between any two cells) and always solvable; same seed always builds the same maze
- **3 sizes** — Easy 10×10, Medium 15×15, Hard 20×20
- **Play your way** — keyboard (arrows / WASD) + on-screen D-pad
- **Timer + move counter** — timer starts on your first move, stops when you reach the flag
- **Show solution** — BFS shortest path drawn on the board; assisted runs are marked and never count as a best time
- **Best times** — best time per size saved in localStorage, survives reload
- **Seed replay** — type any seed (1–999999999) to load that exact maze
- **Data tools** — JSON export / strict import of best times, typed-DELETE erase-all
- **Bilingual** — full EN/বাংলা UI toggle (persisted), Bengali digits in BN mode
- **Offline** — zero network requests; runs from `file://` or any static host

## Stack

- Plain HTML + CSS + JavaScript (no build step, no dependencies)
- SVG board rendering, `localStorage` persistence
- Node.js unit tests + headless-Chrome (CDP) smoke tests

## Prerequisites

- Any modern browser (Chrome, Firefox, Edge, Safari)
- Node.js 18+ only if you want to run the tests

## Run it

```bash
# just open it — no server needed
open index.html
# or serve it
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Tests

```bash
node tests/logic.test.js   # 122 unit tests (generation, solver, movement, i18n, payloads)
node tests/smoke.js        # 63 headless-Chrome checks (render, play, win, i18n, 390px, offline)
```

See [TEST_RESULTS.md](TEST_RESULTS.md) for the latest verified results.

## Project structure

```
index.html          UI shell (ASCII only; all text injected from i18n.js)
css/style.css       Light theme, responsive, 390px mobile
js/logic.js         DOM-free logic: seeded RNG, maze generation, BFS solver,
                    movement rules, time/digit helpers, payload validation
js/data.js          Sizes + storage key/defaults
js/i18n.js          EN/BN strings (Bengali stored as \uXXXX escapes)
js/app.js           DOM app: SVG render, input, timer, best times, data tools
tests/logic.test.js Node unit tests
tests/smoke.js      Headless-Chrome CDP smoke tests
```

## How mazes are generated

A seeded PRNG (mulberry32) drives an iterative recursive-backtracker over the grid: every cell is visited once and exactly `cells − 1` walls are knocked down, which guarantees a perfect maze (a spanning tree — one unique path between any two cells). The solver is breadth-first search from the top-left cell to the bottom-right flag; the same BFS result is what "Show solution" draws.

## Limitations

- Best times live in the browser's localStorage — clearing site data erases them.
- "Show solution" marks the run assisted: it can still be finished, but the time is not saved as a best.
- No multiplayer, no daily maze, no sound effects.
- Mazes are capped at 20×20; larger grids would still generate but are not offered in the UI.

## Status

Run #277 of the MUSE Project Factory Ω (2026-11-08, 15:00 slot). Complete and verified locally; see TEST_RESULTS.md.
