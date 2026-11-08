// Maze BD \u2014 DOM-free logic. Works in browser and Node (for tests).
// A maze is a grid of cells; each cell stores its walls as a bitmask:
// N=1, E=2, S=4, W=8. Generated mazes are PERFECT: exactly one path
// between any two cells (a spanning tree over the grid).
(function (global) {
  'use strict';

  var N = 1, E = 2, S = 4, W = 8;

  var DIRS = {
    up:    { dr: -1, dc: 0, wall: N, opp: S, key: 'up' },
    right: { dr: 0,  dc: 1, wall: E, opp: W, key: 'right' },
    down:  { dr: 1,  dc: 0, wall: S, opp: N, key: 'down' },
    left:  { dr: 0,  dc: -1, wall: W, opp: E, key: 'left' }
  };
  var DIR_ORDER = ['up', 'right', 'down', 'left'];

  var SIZES = [
    { id: 'small', rows: 10, cols: 10 },
    { id: 'medium', rows: 15, cols: 15 },
    { id: 'large', rows: 20, cols: 20 }
  ];

  function sizeById(id) {
    for (var i = 0; i < SIZES.length; i++) if (SIZES[i].id === id) return SIZES[i];
    return SIZES[0];
  }

  // Deterministic PRNG (mulberry32). Same seed -> same sequence, always.
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function newSeed() {
    return 1 + Math.floor(Math.random() * 999999999);
  }

  function idx(rows, cols, r, c) { return r * cols + c; }

  // Iterative recursive-backtracker. Visits every cell exactly once and
  // knocks down exactly (cells - 1) walls, so the result is a perfect maze.
  function generateMaze(rows, cols, seed) {
    rows = Math.max(2, Math.min(40, Math.floor(rows) || 10));
    cols = Math.max(2, Math.min(40, Math.floor(cols) || 10));
    seed = Math.floor(seed) || 1;
    var rng = mulberry32(seed);
    var walls = new Array(rows * cols);
    var visited = new Array(rows * cols);
    var i;
    for (i = 0; i < rows * cols; i++) { walls[i] = N | E | S | W; visited[i] = false; }
    var stack = [[0, 0]];
    visited[0] = true;
    while (stack.length) {
      var cur = stack[stack.length - 1];
      var r = cur[0], c = cur[1];
      var options = [];
      for (var d = 0; d < DIR_ORDER.length; d++) {
        var dir = DIRS[DIR_ORDER[d]];
        var nr = r + dir.dr, nc = c + dir.dc;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        if (!visited[idx(rows, cols, nr, nc)]) options.push(dir);
      }
      if (!options.length) { stack.pop(); continue; }
      var pick = options[Math.floor(rng() * options.length)];
      var pr = r + pick.dr, pc = c + pick.dc;
      walls[idx(rows, cols, r, c)] &= ~pick.wall;
      walls[idx(rows, cols, pr, pc)] &= ~pick.opp;
      visited[idx(rows, cols, pr, pc)] = true;
      stack.push([pr, pc]);
    }
    return { rows: rows, cols: cols, seed: seed, walls: walls };
  }

  function inBounds(maze, r, c) {
    return r >= 0 && r < maze.rows && c >= 0 && c < maze.cols;
  }

  function canMove(maze, r, c, dirKey) {
    if (!inBounds(maze, r, c)) return false;
    var dir = DIRS[dirKey];
    if (!dir) return false;
    if (maze.walls[idx(maze.rows, maze.cols, r, c)] & dir.wall) return false;
    return inBounds(maze, r + dir.dr, c + dir.dc);
  }

  // Returns the new [r, c]; unchanged when the move is blocked.
  function applyMove(maze, r, c, dirKey) {
    if (!canMove(maze, r, c, dirKey)) return [r, c];
    var dir = DIRS[dirKey];
    return [r + dir.dr, c + dir.dc];
  }

  // BFS shortest path from (0,0) to (rows-1, cols-1). Returns an array of
  // [r, c] cells including both ends, or null if unreachable (never for a
  // generated maze \u2014 callers/tests assert non-null).
  function solveMaze(maze) {
    var rows = maze.rows, cols = maze.cols;
    var start = 0, goal = idx(rows, cols, rows - 1, cols - 1);
    var prev = new Array(rows * cols);
    var seen = new Array(rows * cols);
    var i;
    for (i = 0; i < rows * cols; i++) { prev[i] = -1; seen[i] = false; }
    var queue = [start];
    seen[start] = true;
    while (queue.length) {
      var cur = queue.shift();
      if (cur === goal) break;
      var r = Math.floor(cur / cols), c = cur % cols;
      for (var d = 0; d < DIR_ORDER.length; d++) {
        var dir = DIRS[DIR_ORDER[d]];
        var nr = r + dir.dr, nc = c + dir.dc;
        if (!inBounds(maze, nr, nc)) continue;
        if (maze.walls[cur] & dir.wall) continue;
        var ni = idx(rows, cols, nr, nc);
        if (seen[ni]) continue;
        seen[ni] = true;
        prev[ni] = cur;
        queue.push(ni);
      }
    }
    if (!seen[goal]) return null;
    var path = [];
    var at = goal;
    while (at !== -1) {
      path.unshift([Math.floor(at / cols), at % cols]);
      at = prev[at];
    }
    return path;
  }

  // A perfect maze is a spanning tree: every cell reachable from (0,0)
  // and exactly (cells - 1) passages (each passage counted once).
  function isPerfectMaze(maze) {
    var cells = maze.rows * maze.cols;
    var seen = new Array(cells);
    var i;
    for (i = 0; i < cells; i++) seen[i] = false;
    var queue = [0];
    seen[0] = true;
    var reached = 0;
    while (queue.length) {
      var cur = queue.shift();
      reached++;
      var r = Math.floor(cur / maze.cols), c = cur % maze.cols;
      for (var d = 0; d < DIR_ORDER.length; d++) {
        var dir = DIRS[DIR_ORDER[d]];
        if (maze.walls[cur] & dir.wall) continue;
        var nr = r + dir.dr, nc = c + dir.dc;
        if (!inBounds(maze, nr, nc)) continue;
        var ni = idx(maze.rows, maze.cols, nr, nc);
        if (seen[ni]) continue;
        seen[ni] = true;
        queue.push(ni);
      }
    }
    if (reached !== cells) return false;
    var openSides = 0;
    for (i = 0; i < cells; i++) {
      var w = maze.walls[i];
      if (!(w & N)) openSides++;
      if (!(w & E)) openSides++;
      if (!(w & S)) openSides++;
      if (!(w & W)) openSides++;
    }
    return openSides / 2 === cells - 1;
  }

  function countDeadEnds(maze) {
    var n = 0;
    for (var i = 0; i < maze.walls.length; i++) {
      var w = maze.walls[i];
      var open = 0;
      if (!(w & N)) open++;
      if (!(w & E)) open++;
      if (!(w & S)) open++;
      if (!(w & W)) open++;
      if (open === 1) n++;
    }
    return n;
  }

  function formatTime(ms) {
    ms = Math.max(0, Math.floor(ms || 0));
    var s = Math.floor(ms / 1000);
    var m = Math.floor(s / 60);
    var ss = s % 60;
    return m + ':' + (ss < 10 ? '0' : '') + ss;
  }

  var BN_DIGITS = ['\u09E6', '\u09E7', '\u09E8', '\u09E9', '\u09EA',
                   '\u09EB', '\u09EC', '\u09ED', '\u09EE', '\u09EF'];
  function toBnDigits(s) {
    return String(s == null ? '' : s).replace(/[0-9]/g, function (d) {
      return BN_DIGITS[parseInt(d, 10)];
    });
  }

  function parseSeed(str) {
    var s = String(str == null ? '' : str).trim();
    if (!/^[0-9]+$/.test(s)) return { ok: false, error: 'seedNotNumber' };
    var n = parseInt(s, 10);
    if (n < 1 || n > 999999999) return { ok: false, error: 'seedOutOfRange' };
    return { ok: true, seed: n };
  }

  function exportPayload(best) {
    return { app: 'maze-bd', version: 1, best: best || {} };
  }

  function validateBestPayload(p) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return { ok: false, error: 'notObject' };
    if (p.app !== 'maze-bd') return { ok: false, error: 'wrongApp' };
    if (p.version !== 1) return { ok: false, error: 'wrongVersion' };
    if (!p.best || typeof p.best !== 'object' || Array.isArray(p.best)) return { ok: false, error: 'noBest' };
    var out = {};
    var ids = SIZES.map(function (s) { return s.id; });
    for (var k in p.best) {
      if (ids.indexOf(k) === -1) return { ok: false, error: 'badSize' };
      var v = p.best[k];
      if (v !== null) {
        if (!v || typeof v !== 'object') return { ok: false, error: 'badEntry' };
        if (typeof v.ms !== 'number' || !isFinite(v.ms) || v.ms < 0) return { ok: false, error: 'badMs' };
        if (typeof v.moves !== 'number' || Math.floor(v.moves) !== v.moves || v.moves < 1) return { ok: false, error: 'badMoves' };
        out[k] = { ms: Math.floor(v.ms), moves: v.moves };
      } else {
        out[k] = null;
      }
    }
    return { ok: true, best: out };
  }

  var api = {
    WALLS: { N: N, E: E, S: S, W: W },
    DIRS: DIRS,
    DIR_ORDER: DIR_ORDER,
    SIZES: SIZES,
    sizeById: sizeById,
    mulberry32: mulberry32,
    newSeed: newSeed,
    generateMaze: generateMaze,
    solveMaze: solveMaze,
    isPerfectMaze: isPerfectMaze,
    countDeadEnds: countDeadEnds,
    canMove: canMove,
    applyMove: applyMove,
    formatTime: formatTime,
    toBnDigits: toBnDigits,
    parseSeed: parseSeed,
    exportPayload: exportPayload,
    validateBestPayload: validateBestPayload
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.MazeLogic = api;
})(typeof window !== 'undefined' ? window : globalThis);
