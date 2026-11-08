// Maze BD — headless-Chrome smoke test via raw CDP (no puppeteer dependency).
// Usage: node tests/smoke.js
// Exits non-zero on any failed assertion; fails on page console errors.
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const PORT = 9346;
const FILE = 'file://' + path.resolve(__dirname, '..', 'index.html');
let failures = 0;
let count = 0;
const pageErrors = [];
function check(name, cond, extra) {
  count++;
  console.log((cond ? 'ok - ' : 'FAIL - ') + name + (cond ? '' : ' :: ' + (extra || '')));
  if (!cond) failures++;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // NOTE: /opt/meta-chromium/chrome refuses raw launches in this VM
  // ("Hatch WebGL domain policy is required for browser startup" — the
  // policy is normally supplied by browser-daemon). The unpatched
  // Playwright headless_shell serves the same CDP smoke purpose.
  const CHROME_BIN = process.env.CHROME_BIN ||
    require('os').homedir() + '/.cache/ms-playwright/chromium_headless_shell-1187/chrome-linux/headless_shell';
  const chrome = spawn(CHROME_BIN, [
    '--headless=new', '--no-sandbox', '--disable-gpu',
    '--remote-debugging-port=' + PORT, '--user-data-dir=/tmp/maze-smoke-' + process.pid,
    'about:blank',
  ], { stdio: 'ignore' });
  let targets = [];
  for (let i = 0; i < 50 && targets.length === 0; i++) {
    await wait(200);
    try {
      targets = JSON.parse(await new Promise((res, rej) => {
        http.get('http://127.0.0.1:' + PORT + '/json/list', (r) => {
          let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => res(d));
        }).on('error', rej);
      }));
    } catch (e) { /* retry */ }
  }
  if (!targets.length) { console.log('FAIL - chrome did not start'); process.exit(2); }
  const wsUrl = targets[0].webSocketDebuggerUrl;
  const ws = new WebSocket(wsUrl);
  await new Promise((res) => { ws.onopen = res; });
  let seq = 0; const pending = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      pageErrors.push(JSON.stringify(msg.params.args));
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      pageErrors.push(JSON.stringify(msg.params.exceptionDetails).slice(0, 300));
    }
  };
  const send = (method, params) => new Promise((res) => {
    const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params }));
  });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: FILE });
  await wait(1500);
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r.result && r.result.exceptionDetails) return { error: JSON.stringify(r.result.exceptionDetails).slice(0, 300) };
    return r.result ? r.result.result.value : undefined;
  };

  check('page title contains Maze', (await ev('document.title'))?.includes('Maze'));
  check('board SVG renders', (await ev(`document.querySelector('#board svg') !== null`)) === true);
  check('wall lines drawn (>50)', (await ev(`document.querySelectorAll('#board .walls line').length`)) > 50);
  check('player circle present', (await ev(`document.querySelector('#player') !== null`)) === true);
  check('goal flag present', (await ev(`document.querySelector('.goal-flag') !== null`)) === true);
  check('test hooks present', (await ev(`typeof window.__maze.move`)) === 'function');
  check('default size small 10x10', (await ev(`window.__maze.state().rows`)) === 10 && (await ev(`window.__maze.state().cols`)) === 10);
  check('player starts at (0,0)', JSON.stringify(await ev(`window.__maze.state().player`)) === '{"r":0,"c":0}');
  check('seed label shows a seed', (await ev(`document.getElementById('seedLabel').textContent`)).match(/[0-9]+/) !== null);
  check('4 dpad buttons', (await ev(`document.querySelectorAll('.dpad-btn').length`)) === 4);
  check('3 size buttons', (await ev(`document.querySelectorAll('#sizeBtns button').length`)) === 3);
  check('hint text renders', (await ev(`document.getElementById('statusMsg').textContent.length`)) > 10);
  check('disclaimer renders', (await ev(`document.getElementById('disclaimer').textContent.length`)) > 40);

  // Size switching.
  await ev(`window.__maze.setSize('medium')`);
  check('medium is 15x15', (await ev(`window.__maze.state().rows`)) === 15);
  check('medium board has more walls', (await ev(`document.querySelectorAll('#board .walls line').length`)) > 100);
  await ev(`window.__maze.setSize('large')`);
  check('large is 20x20', (await ev(`window.__maze.state().rows`)) === 20);
  await ev(`window.__maze.setSize('small')`);
  check('back to small 10x10', (await ev(`window.__maze.state().rows`)) === 10);

  // Seeded determinism: same seed -> identical walls; different seed -> different.
  await ev(`window.__maze.applySeed('42')`);
  const sig42a = await ev(`window.__maze.wallSignature()`);
  await ev(`window.__maze.applySeed('42')`);
  const sig42b = await ev(`window.__maze.wallSignature()`);
  check('same seed -> identical maze', sig42a === sig42b);
  await ev(`window.__maze.applySeed('43')`);
  const sig43 = await ev(`window.__maze.wallSignature()`);
  check('different seed -> different maze', sig42a !== sig43);
  check('seed 43 recorded', (await ev(`window.__maze.state().seed`)) === 43);
  const badSeed = await ev(`JSON.stringify(window.__maze.applySeed('abc'))`);
  check('invalid seed rejected', badSeed.includes('"ok":false'), badSeed);
  check('invalid seed shows message', (await ev(`document.getElementById('seedMsg').textContent.length`)) > 5);
  const badSeed2 = await ev(`JSON.stringify(window.__maze.applySeed('0'))`);
  check('seed 0 rejected', badSeed2.includes('"ok":false'));
  await ev(`window.__maze.applySeed('42')`);

  // Movement: open direction moves, blocked direction stays.
  const openDir = await ev(`['up','right','down','left'].find(d => window.__maze.canMove(d))`);
  check('an open direction exists from start', typeof openDir === 'string', String(openDir));
  const moved = await ev(`JSON.stringify(window.__maze.move('${openDir}'))`);
  check('open move moves player', moved.includes('"moved":true'), moved);
  check('moves counter is 1', (await ev(`window.__maze.state().moves`)) === 1);
  check('moves display shows 1', (await ev(`document.getElementById('movesVal').textContent`)) === '1');
  check('timer started after first move', (await ev(`window.__maze.state().elapsedMs`)) >= 0);
  await wait(700);
  check('timer ticks (elapsed > 0)', (await ev(`window.__maze.state().elapsedMs`)) > 0);
  const blockedDir = await ev(`['up','right','down','left'].find(d => !window.__maze.canMove(d))`);
  if (blockedDir) {
    const before = await ev(`JSON.stringify(window.__maze.state().player)`);
    await ev(`window.__maze.move('${blockedDir}')`);
    const after = await ev(`JSON.stringify(window.__maze.state().player)`);
    check('blocked move stays in place', before === after);
    check('blocked move does not count', (await ev(`window.__maze.state().moves`)) === 1);
  } else {
    check('blocked direction exists from this cell (skipped: all open)', true);
  }

  // Keyboard: dispatch the key for an open direction, player moves.
  const openDir2 = await ev(`['up','right','down','left'].find(d => window.__maze.canMove(d))`);
  const keyMap = { up: 'ArrowUp', right: 'ArrowRight', down: 'ArrowDown', left: 'ArrowLeft' };
  const movesBefore = await ev(`window.__maze.state().moves`);
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown', {key: '${keyMap[openDir2]}', bubbles: true}))`);
  check('keyboard arrow moves player', (await ev(`window.__maze.state().moves`)) === movesBefore + 1);

  // D-pad button: click the button for an open direction.
  const openDir3 = await ev(`['up','right','down','left'].find(d => window.__maze.canMove(d))`);
  const btnMap = { up: 'dUp', right: 'dRight', down: 'dDown', left: 'dLeft' };
  const movesBefore3 = await ev(`window.__maze.state().moves`);
  await ev(`document.getElementById('${btnMap[openDir3]}').click()`);
  check('d-pad button moves player', (await ev(`window.__maze.state().moves`)) === movesBefore3 + 1);

  // Solution: show -> path drawn + assisted; hide -> hidden.
  await ev(`window.__maze.toggleSolution()`);
  check('solution shown flag', (await ev(`window.__maze.state().solutionShown`)) === true);
  check('solution path has points', (await ev(`document.getElementById('solutionPath').getAttribute('points').length`)) > 10);
  check('solution path visible', (await ev(`document.getElementById('solutionPath').style.display`)) === '');
  check('assisted flag set', (await ev(`window.__maze.state().assisted`)) === true);
  await ev(`window.__maze.toggleSolution()`);
  check('solution hidden again', (await ev(`document.getElementById('solutionPath').style.display`)) === 'none');

  // Win flow: walk the BFS solution path from the current position.
  // (Fresh maze first, so the walk starts at (0,0) with no assist.)
  await ev(`window.__maze.applySeed('7')`);
  const winRes = await ev(`(() => {
    const path = window.__maze.solvePath();
    let cur = { r: 0, c: 0 };
    for (let i = 1; i < path.length; i++) {
      const dr = path[i][0] - cur.r, dc = path[i][1] - cur.c;
      const dir = dr === -1 ? 'up' : dr === 1 ? 'down' : dc === -1 ? 'left' : 'right';
      const r = window.__maze.move(dir);
      cur = window.__maze.state().player;
      if (!r.moved) return 'stuck at step ' + i;
    }
    return window.__maze.state().won ? 'won' : 'not-won';
  })()`);
  check('walking solution path wins the game', winRes === 'won', String(winRes));
  check('win overlay visible', (await ev(`document.getElementById('winOverlay').hidden`)) === false);
  check('win stats show time + moves', (await ev(`document.getElementById('winStats').textContent`)).match(/[0-9]+:[0-9]{2}/) !== null);
  check('moves after win > 18 (Manhattan minimum)', (await ev(`window.__maze.state().moves`)) > 18);
  check('best time saved for small', (await ev(`window.__maze.state().best.small !== null`)) === true);
  check('best chip shows a time', (await ev(`document.getElementById('bestVal').textContent`)).match(/[0-9]+:[0-9]{2}/) !== null);

  // Play again resets the run.
  await ev(`document.getElementById('playAgainBtn').click()`);
  check('play again hides overlay', (await ev(`document.getElementById('winOverlay').hidden`)) === true);
  check('play again resets moves', (await ev(`window.__maze.state().moves`)) === 0);
  check('play again resets player', JSON.stringify(await ev(`window.__maze.state().player`)) === '{"r":0,"c":0}');

  // Best time persists across reload.
  await send('Page.navigate', { url: FILE });
  await wait(1200);
  check('best time persists after reload', (await ev(`window.__maze.state().best.small !== null`)) === true);

  // Language toggle: Bangla title + Bengali digits.
  await ev(`document.getElementById('langBtn').click()`);
  check('BN toggle: title in Bengali', (await ev(`document.getElementById('title').textContent`)) === '\u09ae\u09c7\u099c \u09ac\u09bf\u09a1\u09bf');
  check('BN toggle: moves label in Bengali', (await ev(`document.querySelector('.stat-label').textContent`)) === '\u099a\u09be\u09b2');
  check('BN toggle: moves value uses Bengali digits', (await ev(`document.getElementById('movesVal').textContent`)) === '\u09e6');
  check('BN toggle persists after reload', (await (async () => {
    await send('Page.navigate', { url: FILE });
    await wait(1200);
    return (await ev(`window.__maze.state().lang`)) === 'bn';
  })()));
  await ev(`document.getElementById('langBtn').click()`);
  check('back to EN', (await ev(`window.__maze.state().lang`)) === 'en');

  // Data: export payload + import validation + eraseAll.
  const payload = await ev(`JSON.stringify(window.__maze.exportPayload())`);
  check('export payload is maze-bd v1', payload.includes('"app":"maze-bd"') && payload.includes('"version":1'));
  const imp = await ev(`JSON.stringify(window.__maze.importPayload(JSON.stringify({app:'maze-bd',version:1,best:{medium:{ms:90000,moves:200}}})))`);
  check('import valid payload ok', imp.includes('"ok":true'), imp);
  check('import applied medium best', (await ev(`window.__maze.state().best.medium !== null`)) === true);
  const badImp = await ev(`JSON.stringify(window.__maze.importPayload('{"app":"dua-bd","version":1,"best":{}}'))`);
  check('import wrong app rejected', badImp.includes('"ok":false'));
  check('invalid import leaves data intact', (await ev(`window.__maze.state().best.medium !== null`)) === true);
  await ev(`window.__maze.eraseAll()`);
  check('eraseAll clears best times', (await ev(`window.__maze.state().best.small === null && window.__maze.state().best.medium === null`)) === true);

  // Mobile 390px: no horizontal overflow.
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: FILE });
  await wait(1200);
  const overflow = await ev(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
  check('390px no horizontal overflow', overflow <= 0, 'overflow=' + overflow);
  await ev(`window.__maze.setSize('large')`);
  const overflowL = await ev(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
  check('390px no overflow on large maze', overflowL <= 0, 'overflow=' + overflowL);

  // Zero network requests: app is fully offline (only file:// loads).
  const reqs = await ev(`performance.getEntriesByType('resource').map(r => r.name).filter(n => !n.startsWith('file://')).length`);
  check('zero non-file network requests', reqs === 0, 'non-file=' + reqs);

  check('no console/page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

  chrome.kill();
  console.log('\n' + count + ' checks, ' + failures + ' failed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('FAIL - harness error: ' + e.message); try { chrome.kill(); } catch (_) {} process.exit(2); });
