// Maze BD \u2014 DOM app. Renders the maze as SVG, handles input, timer,
// best times (localStorage), export/import/erase, EN/BN toggle.
(function () {
  'use strict';

  var L = window.MazeLogic;
  var DATA = window.MazeData;
  var I18N = window.MazeI18n;
  var CELL = 32;

  var $ = function (id) { return document.getElementById(id); };

  var state = {
    lang: 'en',
    sizeId: 'small',
    maze: null,
    player: { r: 0, c: 0 },
    moves: 0,
    startedAt: null,
    elapsedMs: 0,
    timerId: null,
    won: false,
    assisted: false,
    solutionShown: false,
    best: { small: null, medium: null, large: null }
  };

  function t(key) {
    return (I18N.STRINGS[state.lang] && I18N.STRINGS[state.lang][key]) ||
      I18N.STRINGS.en[key] || key;
  }

  function fmtNum(n) {
    var s = String(n);
    return state.lang === 'bn' ? L.toBnDigits(s) : s;
  }

  function fmtTime(ms) {
    var s = L.formatTime(ms);
    return state.lang === 'bn' ? L.toBnDigits(s) : s;
  }

  // ---------- storage ----------
  function loadStored() {
    try {
      var raw = localStorage.getItem(DATA.storageKey);
      if (!raw) return;
      var p = JSON.parse(raw);
      if (p.lang === 'en' || p.lang === 'bn') state.lang = p.lang;
      if (p.sizeId && L.sizeById(p.sizeId)) state.sizeId = p.sizeId;
      if (p.best) {
        var v = L.validateBestPayload({ app: 'maze-bd', version: 1, best: p.best });
        if (v.ok) state.best = v.best;
      }
    } catch (e) { /* corrupted storage: start fresh */ }
  }

  function saveStored() {
    try {
      localStorage.setItem(DATA.storageKey, JSON.stringify({
        lang: state.lang, sizeId: state.sizeId, best: state.best
      }));
    } catch (e) { /* storage unavailable: game still works */ }
  }

  // ---------- maze lifecycle ----------
  function stopTimer() {
    if (state.timerId !== null) { clearInterval(state.timerId); state.timerId = null; }
    if (state.startedAt !== null) state.elapsedMs = Date.now() - state.startedAt;
  }

  function resetRun(seed) {
    stopTimer();
    var size = L.sizeById(state.sizeId);
    state.maze = L.generateMaze(size.rows, size.cols, seed);
    state.player = { r: 0, c: 0 };
    state.moves = 0;
    state.startedAt = null;
    state.elapsedMs = 0;
    state.won = false;
    state.assisted = false;
    state.solutionShown = false;
    $('winOverlay').hidden = true;
    $('seedMsg').textContent = '';
    renderBoard();
    renderStats();
    renderSolutionBtn();
    $('statusMsg').textContent = t('startHint');
  }

  function newMaze() { resetRun(L.newSeed()); }

  // ---------- rendering ----------
  function wallLines() {
    var m = state.maze;
    var W = L.WALLS;
    var out = [];
    var r, c;
    for (r = 0; r < m.rows; r++) {
      for (c = 0; c < m.cols; c++) {
        var w = m.walls[r * m.cols + c];
        var x = c * CELL, y = r * CELL;
        if (w & W.N) out.push('<line x1="' + x + '" y1="' + y + '" x2="' + (x + CELL) + '" y2="' + y + '"/>');
        if (w & W.W) out.push('<line x1="' + x + '" y1="' + y + '" x2="' + x + '" y2="' + (y + CELL) + '"/>');
        if (c === m.cols - 1 && (w & W.E)) out.push('<line x1="' + (x + CELL) + '" y1="' + y + '" x2="' + (x + CELL) + '" y2="' + (y + CELL) + '"/>');
        if (r === m.rows - 1 && (w & W.S)) out.push('<line x1="' + x + '" y1="' + (y + CELL) + '" x2="' + (x + CELL) + '" y2="' + (y + CELL) + '"/>');
      }
    }
    return out.join('');
  }

  function renderBoard() {
    var m = state.maze;
    var w = m.cols * CELL, h = m.rows * CELL;
    var gx = (m.cols - 1) * CELL, gy = (m.rows - 1) * CELL;
    var svg = '<svg id="mazeSvg" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="maze">' +
      '<rect x="0" y="0" width="' + CELL + '" height="' + CELL + '" class="start-cell"/>' +
      '<rect x="' + gx + '" y="' + gy + '" width="' + CELL + '" height="' + CELL + '" class="goal-cell"/>' +
      '<g class="walls">' + wallLines() + '</g>' +
      '<polyline id="solutionPath" class="solution" points="" style="display:none"/>' +
      '<g class="goal-flag" transform="translate(' + (gx + CELL / 2) + ',' + (gy + CELL / 2) + ')">' +
      '<line x1="-6" y1="-11" x2="-6" y2="11"/><path d="M -6 -11 L 8 -7 L -6 -3 Z"/></g>' +
      '<circle id="player" class="player" r="' + (CELL * 0.3) + '"/>' +
      '</svg>';
    $('board').innerHTML = svg;
    positionPlayer();
  }

  function positionPlayer() {
    var p = $('player');
    if (!p) return;
    p.setAttribute('cx', state.player.c * CELL + CELL / 2);
    p.setAttribute('cy', state.player.r * CELL + CELL / 2);
  }

  function renderStats() {
    $('movesVal').textContent = fmtNum(state.moves);
    $('timeVal').textContent = fmtTime(state.elapsedMs);
    var b = state.best[state.sizeId];
    $('bestVal').textContent = b ? fmtTime(b.ms) : '\u2014';
    $('seedLabel').textContent = t('seed') + ': ' + fmtNum(state.maze ? state.maze.seed : 0);
    renderBestList();
  }

  function renderBestList() {
    var rows = DATA.sizes.map(function (s) {
      var b = state.best[s.id];
      var label = t('size' + s.id.charAt(0).toUpperCase() + s.id.slice(1));
      var val = b ? fmtTime(b.ms) + ' \u00b7 ' + fmtNum(b.moves) + ' ' + t('movesUnit')
                  : '\u2014';
      return '<tr><td>' + label + '</td><td>' + val + '</td></tr>';
    }).join('');
    $('bestList').innerHTML = rows;
  }

  function renderSolutionBtn() {
    $('solutionBtn').textContent = state.solutionShown ? t('hideSolution') : t('showSolution');
  }

  function applyLang() {
    var els = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < els.length; i++) {
      els[i].textContent = t(els[i].getAttribute('data-i18n'));
    }
    $('seedInput').placeholder = t('seedPlaceholder');
    $('eraseInput').placeholder = t('erasePrompt');
    document.documentElement.lang = state.lang === 'bn' ? 'bn' : 'en';
    document.title = t('title') + ' \u2014 Maze BD';
    $('langBtn').textContent = t('langBtn');
    renderStats();
    renderSolutionBtn();
    if (!state.won) $('statusMsg').textContent = t('startHint');
    // size buttons keep their labels in sync
    var btns = document.querySelectorAll('#sizeBtns button');
    for (var j = 0; j < btns.length; j++) {
      var id = btns[j].getAttribute('data-size');
      btns[j].textContent = t('size' + id.charAt(0).toUpperCase() + id.slice(1));
      btns[j].classList.toggle('active', id === state.sizeId);
    }
  }

  // ---------- play ----------
  function startTimerIfNeeded() {
    if (state.startedAt !== null || state.won) return;
    state.startedAt = Date.now();
    state.timerId = setInterval(function () {
      state.elapsedMs = Date.now() - state.startedAt;
      $('timeVal').textContent = fmtTime(state.elapsedMs);
    }, 250);
  }

  function move(dirKey) {
    if (!state.maze || state.won) return { moved: false, won: false };
    var next = L.applyMove(state.maze, state.player.r, state.player.c, dirKey);
    if (next[0] === state.player.r && next[1] === state.player.c) return { moved: false, won: false };
    state.player = { r: next[0], c: next[1] };
    state.moves++;
    startTimerIfNeeded();
    positionPlayer();
    renderStats();
    if (state.player.r === state.maze.rows - 1 && state.player.c === state.maze.cols - 1) {
      winGame();
      return { moved: true, won: true };
    }
    return { moved: true, won: false };
  }

  function winGame() {
    state.won = true;
    stopTimer();
    var isBest = false;
    var prev = state.best[state.sizeId];
    if (!state.assisted && (!prev || state.elapsedMs < prev.ms)) {
      state.best[state.sizeId] = { ms: state.elapsedMs, moves: state.moves };
      isBest = true;
      saveStored();
    }
    $('winTitle').textContent = t('youSolved');
    $('winStats').textContent = t('winTime') + ': ' + fmtTime(state.elapsedMs) +
      ' \u00b7 ' + t('winMoves') + ': ' + fmtNum(state.moves);
    $('winBest').textContent = state.assisted ? t('assistedNote')
      : (isBest ? t('newBest') : t('yourBest') + ': ' + fmtTime(state.best[state.sizeId].ms));
    $('winOverlay').hidden = false;
    renderStats();
  }

  function toggleSolution() {
    if (!state.maze) return;
    state.solutionShown = !state.solutionShown;
    var path = $('solutionPath');
    if (state.solutionShown) {
      var sol = L.solveMaze(state.maze) || [];
      var pts = sol.map(function (cell) {
        return (cell[1] * CELL + CELL / 2) + ',' + (cell[0] * CELL + CELL / 2);
      }).join(' ');
      path.setAttribute('points', pts);
      path.style.display = '';
      state.assisted = true;
      $('statusMsg').textContent = t('solutionOn');
    } else {
      path.setAttribute('points', '');
      path.style.display = 'none';
      $('statusMsg').textContent = t('solutionOff');
    }
    renderSolutionBtn();
  }

  function applySeed(str) {
    var parsed = L.parseSeed(str);
    if (!parsed.ok) {
      $('seedMsg').textContent = t('invalidSeed');
      return { ok: false, error: parsed.error };
    }
    resetRun(parsed.seed);
    $('seedMsg').textContent = t('seedLoaded') + ': ' + fmtNum(parsed.seed);
    return { ok: true, seed: parsed.seed };
  }

  function setSize(id) {
    var valid = DATA.sizes.some(function (s) { return s.id === id; });
    if (!valid) return;
    if (id === state.sizeId && state.maze) return;
    state.sizeId = id;
    saveStored();
    resetRun(L.newSeed());
    applyLang();
  }

  function setLang(lang) {
    if (lang !== 'en' && lang !== 'bn') return;
    state.lang = lang;
    saveStored();
    applyLang();
  }

  // ---------- export / import / erase ----------
  function exportPayload() {
    return L.exportPayload(state.best);
  }

  function downloadExport() {
    var blob = new Blob([JSON.stringify(exportPayload(), null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'maze-bd-best-times.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function importPayload(text) {
    var parsed;
    try { parsed = JSON.parse(text); } catch (e) { return { ok: false, error: 'badJson' }; }
    var v = L.validateBestPayload(parsed);
    if (!v.ok) return { ok: false, error: v.error };
    state.best = { small: null, medium: null, large: null };
    for (var k in v.best) state.best[k] = v.best[k];
    saveStored();
    renderStats();
    return { ok: true };
  }

  function eraseAll() {
    state.best = { small: null, medium: null, large: null };
    saveStored();
    renderStats();
  }

  // ---------- wire up ----------
  function bind() {
    $('newMazeBtn').addEventListener('click', function () { newMaze(); });
    $('applySeedBtn').addEventListener('click', function () { applySeed($('seedInput').value); });
    $('seedInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') applySeed($('seedInput').value);
    });
    $('solutionBtn').addEventListener('click', toggleSolution);
    $('langBtn').addEventListener('click', function () {
      setLang(state.lang === 'en' ? 'bn' : 'en');
    });
    var sizeBtns = document.querySelectorAll('#sizeBtns button');
    for (var i = 0; i < sizeBtns.length; i++) {
      sizeBtns[i].addEventListener('click', function () { setSize(this.getAttribute('data-size')); });
    }
    var dpad = { dUp: 'up', dDown: 'down', dLeft: 'left', dRight: 'right' };
    for (var id in dpad) {
      (function (dir, elId) {
        $(elId).addEventListener('click', function () { move(dir); });
      })(dpad[id], id);
    }
    document.addEventListener('keydown', function (e) {
      var tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      var map = {
        ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
        w: 'up', s: 'down', a: 'left', d: 'right',
        W: 'up', S: 'down', A: 'left', D: 'right'
      };
      var dir = map[e.key];
      if (dir) { e.preventDefault(); move(dir); }
    });
    $('playAgainBtn').addEventListener('click', function () { resetRun(L.newSeed()); });
    $('nextMazeBtn').addEventListener('click', function () { newMaze(); });
    $('exportBtn').addEventListener('click', downloadExport);
    $('importBtn').addEventListener('click', function () { $('importFile').click(); });
    $('importFile').addEventListener('change', function () {
      var f = this.files && this.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        var r = importPayload(String(reader.result || ''));
        $('dataMsg').textContent = r.ok ? t('importOk') : t('importBad');
      };
      reader.readAsText(f);
      this.value = '';
    });
    $('eraseBtn').addEventListener('click', function () {
      $('eraseBox').hidden = false;
      $('eraseInput').focus();
    });
    $('eraseCancel').addEventListener('click', function () {
      $('eraseBox').hidden = true;
      $('eraseInput').value = '';
      $('dataMsg').textContent = t('eraseCancelled');
    });
    $('eraseConfirm').addEventListener('click', function () {
      if ($('eraseInput').value.trim() === 'DELETE') {
        eraseAll();
        $('eraseBox').hidden = true;
        $('eraseInput').value = '';
        $('dataMsg').textContent = t('eraseDone');
      } else {
        $('dataMsg').textContent = t('erasePrompt');
      }
    });
  }

  // ---------- test hooks ----------
  window.__maze = {
    state: function () {
      return {
        lang: state.lang, sizeId: state.sizeId,
        seed: state.maze ? state.maze.seed : null,
        rows: state.maze ? state.maze.rows : 0,
        cols: state.maze ? state.maze.cols : 0,
        player: { r: state.player.r, c: state.player.c },
        moves: state.moves, elapsedMs: state.elapsedMs,
        won: state.won, assisted: state.assisted,
        solutionShown: state.solutionShown,
        best: JSON.parse(JSON.stringify(state.best))
      };
    },
    newMaze: newMaze,
    setSize: setSize,
    setLang: setLang,
    applySeed: applySeed,
    move: move,
    toggleSolution: toggleSolution,
    solvePath: function () { return state.maze ? L.solveMaze(state.maze) : null; },
    wallSignature: function () { return state.maze ? state.maze.walls.join(',') : ''; },
    canMove: function (dir) { return state.maze ? L.canMove(state.maze, state.player.r, state.player.c, dir) : false; },
    exportPayload: exportPayload,
    importPayload: importPayload,
    eraseAll: eraseAll
  };

  loadStored();
  bind();
  applyLang();
  resetRun(L.newSeed());
})();
