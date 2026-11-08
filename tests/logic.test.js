// Maze BD — node unit tests for js/logic.js + js/data.js + js/i18n.js.
// Usage: node tests/logic.test.js  (exit non-zero on failure)
const L = require('../js/logic.js');
const DATA = require('../js/data.js');
const I18N = require('../js/i18n.js');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('ok - ' + name); }
  else { fail++; console.log('FAIL - ' + name + (extra ? ' :: ' + extra : '')); }
}

// ---- sizes / data ----
check('3 sizes: 10/15/20', L.SIZES.length === 3 &&
  L.SIZES[0].rows === 10 && L.SIZES[1].rows === 15 && L.SIZES[2].rows === 20);
check('sizeById falls back to small', L.sizeById('bogus').id === 'small' && L.sizeById('large').rows === 20);
check('data sizes match logic sizes', JSON.stringify(DATA.sizes) === JSON.stringify(L.SIZES));
check('data app/version', DATA.app === 'maze-bd' && DATA.version === 1 && DATA.storageKey === 'maze-bd-v1');

// ---- RNG determinism ----
const r1 = L.mulberry32(42), r2 = L.mulberry32(42), r3 = L.mulberry32(43);
const s1 = [r1(), r1(), r1()], s2 = [r2(), r2(), r2()], s3 = [r3(), r3(), r3()];
check('same seed -> same RNG sequence', JSON.stringify(s1) === JSON.stringify(s2));
check('different seed -> different RNG sequence', JSON.stringify(s1) !== JSON.stringify(s3));
check('RNG values in [0,1)', s1.every(v => v >= 0 && v < 1));

// ---- generation: perfect maze invariants, all sizes, several seeds ----
[10, 15, 20].forEach(function (n) {
  [1, 7, 42, 123456].forEach(function (seed) {
    const m = L.generateMaze(n, n, seed);
    check('maze ' + n + 'x' + n + ' seed ' + seed + ' is perfect',
      L.isPerfectMaze(m), 'rows=' + m.rows + ' walls=' + m.walls.length);
    const sol = L.solveMaze(m);
    check('maze ' + n + 'x' + n + ' seed ' + seed + ' solvable',
      Array.isArray(sol) && sol.length > 0);
    check('solution starts (0,0) ends (' + (n - 1) + ',' + (n - 1) + ')',
      sol[0][0] === 0 && sol[0][1] === 0 &&
      sol[sol.length - 1][0] === n - 1 && sol[sol.length - 1][1] === n - 1);
    check('solution path is longer than Manhattan distance',
      sol.length - 1 >= 2 * (n - 1), 'steps=' + (sol.length - 1));
    // every consecutive step must be a legal move (no wall crossed)
    let legal = true;
    for (let i = 1; i < sol.length; i++) {
      const dr = sol[i][0] - sol[i - 1][0], dc = sol[i][1] - sol[i - 1][1];
      const dir = dr === -1 ? 'up' : dr === 1 ? 'down' : dc === -1 ? 'left' : dc === 1 ? 'right' : null;
      if (!dir || !L.canMove(m, sol[i - 1][0], sol[i - 1][1], dir)) { legal = false; break; }
    }
    check('solution steps are all legal moves (' + n + ' seed ' + seed + ')', legal);
    check('maze ' + n + ' seed ' + seed + ' has dead ends', L.countDeadEnds(m) > 0,
      'deadEnds=' + L.countDeadEnds(m));
  });
});

// ---- determinism of generation ----
const a = L.generateMaze(10, 10, 42), b = L.generateMaze(10, 10, 42), c = L.generateMaze(10, 10, 43);
check('same seed -> identical maze', JSON.stringify(a.walls) === JSON.stringify(b.walls));
check('different seed -> different maze', JSON.stringify(a.walls) !== JSON.stringify(c.walls));
check('maze records its seed', a.seed === 42 && c.seed === 43);
check('maze dims recorded', a.rows === 10 && a.cols === 10);

// ---- movement rules ----
const m10 = L.generateMaze(10, 10, 42);
// find a cell with an open move and one with a blocked move, by scanning
let openCase = null, blockedCase = null;
outer:
for (let r = 0; r < 10; r++) {
  for (let cc = 0; cc < 10; cc++) {
    for (const d of L.DIR_ORDER) {
      if (L.canMove(m10, r, cc, d) && !openCase) openCase = [r, cc, d];
      if (!L.canMove(m10, r, cc, d) && !blockedCase) blockedCase = [r, cc, d];
      if (openCase && blockedCase) break outer;
    }
  }
}
check('found open + blocked test cases', !!openCase && !!blockedCase);
if (openCase) {
  const next = L.applyMove(m10, openCase[0], openCase[1], openCase[2]);
  const expect = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] }[openCase[2]];
  check('open move steps to neighbour', next[0] === openCase[0] + expect[0] && next[1] === openCase[1] + expect[1]);
}
if (blockedCase) {
  const next = L.applyMove(m10, blockedCase[0], blockedCase[1], blockedCase[2]);
  check('blocked move stays in place', next[0] === blockedCase[0] && next[1] === blockedCase[1]);
}
check('move out of bounds stays', JSON.stringify(L.applyMove(m10, 0, 0, 'up')) === '[0,0]' &&
  JSON.stringify(L.applyMove(m10, 0, 0, 'left')) === '[0,0]');
check('unknown direction stays', JSON.stringify(L.applyMove(m10, 0, 0, 'north')) === '[0,0]');
check('canMove rejects unknown direction', L.canMove(m10, 0, 0, 'north') === false);
check('canMove rejects out-of-bounds cell', L.canMove(m10, -1, 0, 'down') === false);

// ---- time + digits ----
check('formatTime 0 -> 0:00', L.formatTime(0) === '0:00');
check('formatTime 65000 -> 1:05', L.formatTime(65000) === '1:05');
check('formatTime 600000 -> 10:00', L.formatTime(600000) === '10:00');
check('formatTime 59999 -> 0:59', L.formatTime(59999) === '0:59');
check('formatTime clamps negative', L.formatTime(-5000) === '0:00');
check('toBnDigits 123 -> Bengali', L.toBnDigits('123') === '\u09E7\u09E8\u09E9');
check('toBnDigits keeps colon', L.toBnDigits('10:05') === '\u09E7\u09E6:\u09E6\u09EB');
check('toBnDigits leaves letters', L.toBnDigits('a1b') === 'a\u09E7b');

// ---- seed parsing ----
check('parseSeed 42 ok', L.parseSeed('42').ok && L.parseSeed('42').seed === 42);
check('parseSeed trims spaces', L.parseSeed('  7 ').ok && L.parseSeed('  7 ').seed === 7);
check('parseSeed 999999999 ok', L.parseSeed('999999999').ok);
check('parseSeed 0 rejected', !L.parseSeed('0').ok);
check('parseSeed 1000000000 rejected', !L.parseSeed('1000000000').ok);
check('parseSeed abc rejected', !L.parseSeed('abc').ok);
check('parseSeed empty rejected', !L.parseSeed('').ok);
check('parseSeed decimal rejected', !L.parseSeed('4.2').ok);
check('parseSeed negative rejected', !L.parseSeed('-5').ok);
check('newSeed in range', (() => { const s = L.newSeed(); return s >= 1 && s <= 999999999; })());

// ---- best-times payload validation ----
const good = { app: 'maze-bd', version: 1, best: { small: { ms: 45000, moves: 120 }, medium: null } };
check('valid best payload ok', L.validateBestPayload(good).ok);
check('export payload round-trips', (() => {
  const p = L.exportPayload({ small: { ms: 1000, moves: 5 }, medium: null, large: null });
  return L.validateBestPayload(p).ok && p.app === 'maze-bd' && p.version === 1;
})());
check('wrong app rejected', !L.validateBestPayload({ app: 'dua-bd', version: 1, best: {} }).ok);
check('wrong version rejected', !L.validateBestPayload({ app: 'maze-bd', version: 2, best: {} }).ok);
check('missing best rejected', !L.validateBestPayload({ app: 'maze-bd', version: 1 }).ok);
check('bad size key rejected', !L.validateBestPayload({ app: 'maze-bd', version: 1, best: { huge: null } }).ok);
check('negative ms rejected', !L.validateBestPayload({ app: 'maze-bd', version: 1, best: { small: { ms: -1, moves: 5 } } }).ok);
check('zero moves rejected', !L.validateBestPayload({ app: 'maze-bd', version: 1, best: { small: { ms: 100, moves: 0 } } }).ok);
check('null payload rejected', !L.validateBestPayload(null).ok);
check('string payload rejected', !L.validateBestPayload('{"app":"maze-bd"}').ok);

// ---- i18n parity ----
const enKeys = Object.keys(I18N.STRINGS.en).sort();
const bnKeys = Object.keys(I18N.STRINGS.bn).sort();
check('EN/BN have identical keys', JSON.stringify(enKeys) === JSON.stringify(bnKeys),
  'en=' + enKeys.length + ' bn=' + bnKeys.length);
check('every BN string non-empty + has Bengali chars (except langBtn, which names the other language)', Object.keys(I18N.STRINGS.bn).every(k => {
  const v = I18N.STRINGS.bn[k];
  if (k === 'langBtn') return v === 'English';
  return typeof v === 'string' && v.length > 0 && /[\u0980-\u09FF]/.test(v);
}));
check('every EN string non-empty', Object.keys(I18N.STRINGS.en).every(k => {
  const v = I18N.STRINGS.en[k];
  return typeof v === 'string' && v.length > 0;
}));
check('size keys exist for all sizes', L.SIZES.every(s =>
  I18N.STRINGS.en['size' + s.id.charAt(0).toUpperCase() + s.id.slice(1)] &&
  I18N.STRINGS.bn['size' + s.id.charAt(0).toUpperCase() + s.id.slice(1)]));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
