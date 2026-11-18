// Neon Harbor interactive play-test: load the game in headless Chrome via CDP
// (Node stdlib only: fetch + global WebSocket), drive it with real DOM input
// events, and assert the whole crime loop works — walk, steal a car, drive,
// shoot, wanted level rises, police spawn, mission 1 completes.
//
// Headless Chrome throttles requestAnimationFrame to a few fps, so the test
// advances the game with fixed manual steps (window.__game.update(1/60)) —
// the same update the frame loop calls — while keys are held down.
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

const GAME_DIR = new URL('./game/', import.meta.url).pathname;
const CHROME = '/opt/meta-chromium/chrome';
const PORT = 9223;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
const netRequests = [];
let passed = 0;
let failed = 0;

function check(name, ok, detail) {
  if (ok) { passed += 1; console.log(`  PASS ${name}`); }
  else { failed += 1; console.log(`  FAIL ${name} ${detail ?? ''}`); }
}

async function launchChrome() {
  const policyPath = '/var/lib/hatch-browser/rootfs-base/usr/share/hatch/chromium/webgl-allowed-domains.txt';
  const policySha = createHash('sha256').update(readFileSync(policyPath)).digest('hex');
  const chrome = spawn(CHROME, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    `--remote-debugging-port=${PORT}`,
    '--hide-scrollbars',
    '--window-size=1280,720',
    `--hatch-webgl-allowed-domains-file=${policyPath}`,
    `--hatch-webgl-allowed-domains-sha256=${policySha}`,
    '--allow-file-access-from-files',
    '--user-data-dir=/tmp/neonharbor-chrome-profile',
    'about:blank',
  ], { stdio: 'ignore' });
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) return chrome;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error('chrome did not start');
}

let msgId = 0;
const pending = new Map();
function send(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(ws, expression) {
  const msg = await send(ws, 'Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (msg?.result?.exceptionDetails) return { __error: msg.result.exceptionDetails.text || 'eval error' };
  return msg?.result?.result?.value;
}
function key(ws, type, k) {
  return send(ws, 'Runtime.evaluate', {
    expression: `window.dispatchEvent(new KeyboardEvent('${type}', {key: '${k}', bubbles: true}))`,
    returnByValue: true,
  });
}
// Advance the game by fixed 1/60 steps (the same update the frame loop calls).
async function step(ws, seconds) {
  const n = Math.max(1, Math.round(seconds * 60));
  return evaluate(ws, `(() => { const g = window.__game; for (let i = 0; i < ${n}; i += 1) g.update(1/60); return g.time; })()`);
}
async function holdKey(ws, k, seconds) {
  await key(ws, 'keydown', k);
  await step(ws, seconds);
  await key(ws, 'keyup', k);
}

async function main() {
  const chrome = await launchChrome();
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id).resolve(msg);
      pending.delete(msg.id);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      errors.push(`exception: ${msg.params.exceptionDetails?.text || ''} ${msg.params.exceptionDetails?.exception?.description || ''}`);
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      errors.push(`console.error: ${msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
    } else if (msg.method === 'Network.requestWillBeSent') {
      const url = msg.params.request.url;
      if (url.startsWith('http://') || url.startsWith('https://')) netRequests.push(url);
    }
  };
  await send(ws, 'Runtime.enable');
  await send(ws, 'Page.enable');
  await send(ws, 'Network.enable');
  await send(ws, 'Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send(ws, 'Page.navigate', { url: `file://${GAME_DIR}index.html` });
  await sleep(2500);

  // Measure how fast requestAnimationFrame actually runs headless.
  const rafRate = await evaluate(ws, `new Promise((res) => { let n = 0; const t0 = performance.now(); const tick = () => { n += 1; if (performance.now() - t0 < 1000) requestAnimationFrame(tick); else res(n); }; requestAnimationFrame(tick); })`);
  console.log(`rAF rate headless: ~${rafRate} fps`);

  console.log('== load ==');
  check('game object exists', (await evaluate(ws, '!!window.__game')) === true);
  check('title screen showing', (await evaluate(ws, 'window.__game.state')) === 'title');
  check('city generated', (await evaluate(ws, 'window.__game.city.buildings.length')) > 20);
  check('traffic spawned', (await evaluate(ws, 'window.__game.traffic.cars.length')) >= 20);
  check('peds spawned', (await evaluate(ws, 'window.__game.traffic.peds.length')) >= 20);

  // Start the game.
  await evaluate(ws, `localStorage.clear(); document.getElementById('btn-start').click()`);
  await step(ws, 0.5);
  console.log('== start ==');
  check('state playing', (await evaluate(ws, 'window.__game.state')) === 'playing');
  check('mission 1 active', (await evaluate(ws, 'window.__game.missions.index')) === 0);
  check('mission 1 step 0 (find a car)', (await evaluate(ws, 'window.__game.missions.stepIndex')) === 0);

  // Walk toward the mission marker (steered by dominant axis, not blindly).
  const x0 = await evaluate(ws, 'window.__game.player.x');
  let reached = false;
  for (let i = 0; i < 30; i += 1) {
    const s = await evaluate(ws, `(() => { const g = window.__game; const m = g.missions.marker(); if (!m) return { done: true }; return { done: false, dx: m.x - g.player.x, dy: m.y - g.player.y, d: Math.hypot(m.x - g.player.x, m.y - g.player.y) }; })()`);
    if (!s) break;
    if (s.done) { reached = true; break; } // marker gone = step completed
    if (s.d < 45) { reached = true; break; }
    const k = Math.abs(s.dx) > Math.abs(s.dy) ? (s.dx > 0 ? 'd' : 'a') : (s.dy > 0 ? 's' : 'w');
    await holdKey(ws, k, 0.2);
  }
  const x1 = await evaluate(ws, 'window.__game.player.x');
  console.log('== walk ==');
  check('player walks to the marker', reached, `x ${x0} -> ${x1}`);
  check('mission step advanced to enterCar', (await evaluate(ws, 'window.__game.missions.stepIndex')) === 1);

  // Steal the car. E first dismisses any mission dialogue line, so press
  // until the player is actually in the car.
  for (let i = 0; i < 6; i += 1) {
    if (await evaluate(ws, '!!window.__game.player.inCar')) break;
    await key(ws, 'keydown', 'e');
    await step(ws, 0.15);
    await key(ws, 'keyup', 'e');
  }
  await step(ws, 0.3);
  console.log('== steal ==');
  check('player in a car', (await evaluate(ws, '!!window.__game.player.inCar')) === true);
  check('stealing raised heat', (await evaluate(ws, 'window.__game.wanted.heat')) > 0);
  check('mission step advanced to drive', (await evaluate(ws, 'window.__game.missions.stepIndex')) === 2);

  // Drive to the garage marker along the roads (Manhattan waypoints via the
  // nearest road lines), steering toward each waypoint in turn.
  console.log('== drive ==');
  const route = await evaluate(ws, `(() => {
    const g = window.__game;
    const m = g.missions.marker();
    const car = g.player.inCar;
    if (!car || !m) return null;
    const LINES = [72, 398, 724, 1050, 1376, 1702, 2028];
    const near = (v) => LINES.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a), LINES[0]);
    return [
      { x: near(car.x), y: near(m.y) },
      { x: near(m.x), y: near(m.y) },
      { x: m.x, y: m.y },
    ];
  })()`);
  let drove = false;
  if (route) {
    for (const wp of route) {
      for (let i = 0; i < 60; i += 1) {
        const s = await evaluate(ws, `(() => { const g = window.__game; const car = g.player.inCar; if (!car) return null; return { d: Math.hypot(${wp.x} - car.x, ${wp.y} - car.y), x: car.x, y: car.y, angle: car.angle }; })()`);
        if (!s) break;
        if (s.d < 55) break;
        const want = Math.atan2(wp.y - s.y, wp.x - s.x);
        let diff = want - s.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const steerKey = diff > 0.25 ? 'd' : diff < -0.25 ? 'a' : null;
        await key(ws, 'keydown', 'w');
        if (steerKey) await key(ws, 'keydown', steerKey);
        await step(ws, 0.25);
        if (steerKey) await key(ws, 'keyup', steerKey);
        await key(ws, 'keyup', 'w');
        // If the car is stuck against a building, back up and try again.
        if (s.d > 400 && i > 20 && i % 10 === 0) {
          await holdKey(ws, 's', 0.6);
        }
      }
    }
    const final = await evaluate(ws, `(() => { const g = window.__game; return g.missions.index; })()`);
    drove = final >= 1; // mission 1 completed = the drive reached the garage
  }
  await step(ws, 0.3);
  check('drove to the garage marker', drove);
  check('mission 1 complete (index 1)', (await evaluate(ws, 'window.__game.missions.index')) === 1);
  check('mission reward paid ($350)', (await evaluate(ws, 'window.__game.money')) >= 350);

  // Exit the car and shoot. Mission 2's intro dialogue opens when mission 1
  // completes, and E dismisses dialogue lines first — clear it, then exit.
  for (let i = 0; i < 5; i += 1) {
    const open = await evaluate(ws, 'window.__game.hud.dialogueLines.length');
    if (!open) break;
    await key(ws, 'keydown', 'e');
    await step(ws, 0.15);
    await key(ws, 'keyup', 'e');
  }
  await key(ws, 'keydown', 'e');
  await step(ws, 0.2);
  await key(ws, 'keyup', 'e');
  await step(ws, 0.3);
  const ammo0 = await evaluate(ws, 'window.__game.player.ammo');
  await evaluate(ws, `(() => { const c = document.getElementById('game'); const r = c.getBoundingClientRect(); c.dispatchEvent(new MouseEvent('mousemove', {clientX: r.left + 900, clientY: r.top + 300, bubbles: true})); c.dispatchEvent(new MouseEvent('mousedown', {button: 0, clientX: r.left + 900, clientY: r.top + 300, bubbles: true})); })()`);
  await step(ws, 0.5);
  await evaluate(ws, `(() => { const c = document.getElementById('game'); c.dispatchEvent(new MouseEvent('mouseup', {button: 0, bubbles: true})); })()`);
  const ammo1 = await evaluate(ws, 'window.__game.player.ammo');
  console.log('== combat ==');
  check('shooting spends ammo', ammo1 < ammo0, `${ammo0} -> ${ammo1}`);
  check('player not in car after E', (await evaluate(ws, '!!window.__game.player.inCar')) === false);

  // Wanted: clear the old 1-star chase, force heat and check the police
  // respond. The player keeps walking while the cops close in, so no cop
  // can grab them for the 1.4s bust timer.
  await evaluate(ws, 'window.__game.wanted.clear()');
  await evaluate(ws, 'window.__game.wanted.setHeat(55)');
  await key(ws, 'keydown', 'w');
  await step(ws, 1.5);
  await key(ws, 'keyup', 'w');
  console.log('== police ==');
  const policeState = await evaluate(ws, `(() => { const g = window.__game; return { state: g.state, hp: Math.round(g.player.hp), stars: g.wanted.stars, cars: g.wanted.copCars.length, foot: g.wanted.footCops.length }; })()`);
  console.log('  police state:', JSON.stringify(policeState));
  check('3 wanted stars', policeState.stars === 3, JSON.stringify(policeState));
  check('cop cars spawned', policeState.cars >= 1, JSON.stringify(policeState));
  check('foot cops spawned', policeState.foot >= 1, JSON.stringify(policeState));
  // Heal up so the rest of the test runs from a live player.
  await evaluate(ws, 'window.__game.player.hp = window.__game.player.maxHp');

  // Pause / resume. The P key is handled in the frame loop (not update), so
  // hold it down long enough for a throttled headless frame to see it.
  await key(ws, 'keydown', 'p');
  await sleep(900);
  await key(ws, 'keyup', 'p');
  await sleep(300);
  check('pause works', (await evaluate(ws, 'window.__game.state')) === 'paused');
  await key(ws, 'keydown', 'p');
  await sleep(900);
  await key(ws, 'keyup', 'p');
  await sleep(300);
  check('resume works', (await evaluate(ws, 'window.__game.state')) === 'playing');

  // Save exists.
  check('save written', (await evaluate(ws, '!!localStorage.getItem("neonharbor-save-v1")')) === true);

  console.log('== errors / network ==');
  check('zero console errors/exceptions', errors.length === 0, errors.slice(0, 3).join(' | '));
  check('zero http(s) requests', netRequests.length === 0, netRequests.slice(0, 3).join(' | '));

  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
  ws.close();
  chrome.kill();
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('playtest crashed:', e); process.exit(2); });
