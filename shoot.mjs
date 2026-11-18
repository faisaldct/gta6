// Screenshot script for Neon Harbor — captures 4 real renders of the game
// (cover, foot, chase, mission) at 1280x720 via headless Chrome/CDP.
// Each scene is staged by game/src/shots.js (?shot=<name>) and advanced with
// fixed steps through window.__shotTick, then repainted and captured.
// Loads via file:// — this headless Chrome blocks 127.0.0.1 requests
// (Local Network Access checks), so no local HTTP server is used.
// Usage: node shoot.mjs   (writes screenshots/)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const WIDTH = 1280;
const HEIGHT = 720;
const SHOTS = [
  ['1-cover', 'cover'],
  ['2-foot', 'foot'],
  ['3-chase', 'chase'],
  ['4-mission', 'mission'],
];

function launchChrome(port) {
  return new Promise((resolve, reject) => {
    const profile = `/tmp/neonharbor-shoot-${port}`;
    const policyPath = '/var/lib/hatch-browser/rootfs-base/usr/share/hatch/chromium/webgl-allowed-domains.txt';
    const policySha = createHash('sha256').update(fs.readFileSync(policyPath)).digest('hex');
    const args = [
      '--headless=new', '--no-sandbox', '--disable-gpu',
      `--remote-debugging-port=${port}`,
      '--hide-scrollbars', `--window-size=${WIDTH},${HEIGHT}`,
      `--hatch-webgl-allowed-domains-file=${policyPath}`,
      `--hatch-webgl-allowed-domains-sha256=${policySha}`,
      '--allow-file-access-from-files',
      `--user-data-dir=${profile}`, 'about:blank',
    ];
    const child = execFile('/opt/meta-chromium/chrome', args, () => {});
    child.on('error', reject);
    setTimeout(() => resolve(child), 4000);
  });
}

async function getWsUrl(port) {
  for (let i = 0; i < 30; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('no debuggable page');
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    const listeners = { console: [], network: [] };
    ws.onopen = () => resolve({
      send(method, params = {}) {
        return new Promise((res, rej) => {
          const mid = ++id;
          pending.set(mid, { res, rej });
          ws.send(JSON.stringify({ id: mid, method, params }));
        });
      },
      onEvent(fn) { listeners.fn = fn; },
      listeners,
      close() { ws.close(); },
    });
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message));
        else res(msg.result);
      } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        listeners.console.push(msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
      } else if (msg.method === 'Runtime.exceptionThrown') {
        listeners.console.push('EXCEPTION: ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
      } else if (msg.method === 'Network.requestWillBeSent' && /^https?:/.test(msg.params.request.url)) {
        listeners.network.push(msg.params.request.url);
      }
    };
    ws.onerror = reject;
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const chrome = await launchChrome(9223);
  const client = await connect(await getWsUrl(9223));
  await client.send('Runtime.enable');
  await client.send('Page.enable');
  await client.send('Network.enable');
  await client.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false });

  const results = [];
  for (const [file, shot] of SHOTS) {
    await client.send('Page.navigate', { url: `file://${ROOT}/game/index.html?shot=${shot}&seed=7` });
    // Wait for the game + shot hooks.
    for (let i = 0; i < 40; i += 1) {
      const r = await client.send('Runtime.evaluate', { expression: '!!(window.__game && window.__shotTick)', returnByValue: true });
      if (r.result.value) break;
      await sleep(250);
    }
    // Advance the scene 150 fixed steps with the autopilot.
    for (let i = 0; i < 200; i += 1) {
      const r = await client.send('Runtime.evaluate', { expression: 'window.__shotReady === true', returnByValue: true });
      if (r.result.value) break;
      await client.send('Runtime.evaluate', { expression: 'window.__shotTick()' });
    }
    await client.send('Runtime.evaluate', { expression: 'window.__shotDraw()' });
    await sleep(200);
    const shotRes = await client.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
    const out = path.join(ROOT, 'screenshots', `${file}.jpg`);
    fs.writeFileSync(out, Buffer.from(shotRes.data, 'base64'));
    const size = fs.statSync(out).size;
    const ready = await client.send('Runtime.evaluate', { expression: '({ ready: window.__shotReady, err: window.__shotError, state: window.__game && window.__game.state })', returnByValue: true });
    results.push({ file, size, ...ready.result.value });
    console.log(`${file}.jpg  ${size} bytes  ready=${ready.result.value.ready} err=${ready.result.value.err} state=${ready.result.value.state}`);
  }
  console.log('console errors:', client.listeners.console);
  console.log('http(s) requests:', client.listeners.network);
  client.close();
  chrome.kill();
  const bad = results.filter((r) => !r.ready || r.err || r.size > 262144);
  if (bad.length) { console.error('SHOT FAILURES:', bad); process.exit(1); }
  console.log('ALL 4 SHOTS OK');
}

main().catch((e) => { console.error(e); process.exit(1); });
