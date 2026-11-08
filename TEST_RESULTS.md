# Maze BD — test results (run #274, 2026-11-08)

## Unit tests — 122/122 pass

`node tests/logic.test.js` — sizes/data integrity; mulberry32 determinism
(same seed → same sequence, different seed → different); for 10×10, 15×15
and 20×20 × seeds 1/7/42/123456: perfect-maze invariant (every cell
reachable + exactly cells−1 passages), solvable, solution starts (0,0) and
ends at the goal, solution longer than Manhattan distance, every solution
step is a legal move (no wall crossed), dead ends exist; generation
determinism (seed 42 → identical walls, seed 43 → different); movement
rules (open move steps to the neighbour, blocked move stays, out-of-bounds
and unknown directions stay); formatTime (0 → 0:00, 65000 → 1:05, 600000 →
10:00, 59999 → 0:59, negative clamped); toBnDigits; parseSeed (42 ok,
spaces trimmed, 999999999 ok, 0 / 1000000000 / abc / empty / 4.2 / −5
rejected); newSeed in range; best-times payload validation (valid ok,
export round-trips, wrong app/version/missing best/bad size/negative
ms/zero moves/null/string rejected); i18n EN/BN key parity, every BN string
non-empty with Bengali chars (langBtn excepted — it names the other
language), size keys for all sizes.

Repairs: 1 test-side fix (the BN-strings check now exempts `langBtn`,
whose BN value is legitimately the Latin word "English"). 0 app-logic bugs.

## Headless-Chrome smoke — 63/63 pass, 0 console/page errors

`node tests/smoke.js` (raw CDP against Playwright `headless_shell-1187`,
`file://`) — title, SVG board + walls + player + goal flag, hooks, default
10×10, player at (0,0), seed label, 4 D-pad + 3 size buttons, hint +
disclaimer; size switching 15×15 / 20×20 / back to 10×10; seed
determinism (42 twice → identical wall signature, 43 → different, seed
recorded, 'abc' and '0' rejected with message); open move moves player
(moves 1, display 1), timer ticks after first move, blocked move stays in
place and does not count; keyboard arrow moves player; D-pad button moves
player; solution toggle shows the BFS path + sets assisted, hides again;
full win by walking the BFS path (seed 7): overlay visible, win stats show
time + moves, moves > 18 (Manhattan minimum), best time saved for small,
best chip shows a time; play again hides overlay and resets moves/player;
best time persists across reload; BN toggle (title মেজ বিডি, moves label
চাল, moves value ০) + persistence across reload + back to EN; export
payload is maze-bd v1, valid import applied, wrong-app import rejected and
leaves data intact, eraseAll clears bests; 390px no horizontal overflow
(small + large); zero non-file network requests.

Hand-verified: screenshot of the 10×10 board (player on green start cell,
green flag on goal cell, clean walls, controls + stats render correctly).

Repairs: none. 0 failures on first smoke run.
