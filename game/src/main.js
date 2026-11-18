// Neon Harbor — the game itself. Wires the city, the player, traffic, police,
// missions, combat, HUD and audio into one loop, plus the screens (title,
// pause, busted, wasted, story complete) and the save.
import { VIEW_W, VIEW_H, CAM_SMOOTH, ROAD_LINES, BUSTED_LOSS } from './config.js';
import { makeRng, clamp } from './random.js';
import { generateCity } from './world.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { Player } from './player.js';
import { Car } from './vehicles.js';
import { TrafficManager } from './traffic.js';
import { WantedSystem } from './police.js';
import { Combat } from './combat.js';
import { MissionEngine } from './missions.js';
import { Hud } from './hud.js';
import { drawWorld } from './render.js';
import { saveGame, loadGame, hasSave, clearSave } from './save.js';
import { stageShot, autopilotStep, SHOT_NAMES } from './shots.js';

export class Game {
  constructor(canvas) {
    const params = new URLSearchParams(window.location.search);
    this.seed = parseInt(params.get('seed') || '1', 10) || 1;
    this.shotName = params.get('shot');
    this.shotMode = this.shotName && SHOT_NAMES.includes(this.shotName);
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.rng = makeRng(this.seed);
    this.city = generateCity(this.seed);
    Car.city = this.city;
    this.input = new Input(canvas);
    this.audio = new AudioEngine();
    this.hud = new Hud();
    this.player = new Player(this.city.landmarks.safehouse.x + 40, this.city.landmarks.safehouse.y + 40);
    this.traffic = new TrafficManager(this.city, this.rng);
    this.wanted = new WantedSystem(this);
    this.combat = new Combat(this);
    this.missions = new MissionEngine(this);
    this.missionCars = [];
    this.camera = { x: this.player.x, y: this.player.y };
    this.time = 0;
    this.clock = 16 * 3600 + 30 * 60; // 16:30, late afternoon
    this.money = 150;
    this.stats = { shotsFired: 0, carsStolen: 0, pedsHit: 0, copsDown: 0, missionsDone: 0, timePlayed: 0 };
    this.state = 'title';
    this.aimMode = true;
    this.lastSave = 0;
    this.pickupTimer = 0;
    this.shotFrames = 0;
    this.shotDone = false;
    this.spawnStarterPickups();
    this.bindScreens();
    if (this.shotMode) {
      this.hud.shotMode = true;
      this.audio.muted = true;
      stageShot(this, this.shotName);
      // The title screen is visible by default in the HTML; hide every
      // screen overlay so screenshots show the live game, not the menu.
      this.showScreen(null);
    } else {
      this.showScreen('title');
      this.updateContinueButton();
    }
    window.__game = this;
    window.__shotReady = false;
    window.__shotError = null;
    // Test hooks: advance one fixed shot step and repaint. Headless Chrome
    // throttles requestAnimationFrame, so the screenshot script drives the
    // game with these instead of waiting on the frame loop.
    window.__shotTick = () => {
      if (!this.shotMode || this.shotDone) return false;
      this.update(1 / 60);
      autopilotStep(this, 1 / 60);
      this.shotFrames += 1;
      if (this.shotFrames >= 150) { this.shotDone = true; window.__shotReady = true; }
      return true;
    };
    window.__shotDraw = () => { drawWorld(this.ctx, this); };
    window.addEventListener('error', (e) => { window.__shotError = String(e.message || e.error); });
    this.lastTs = performance.now();
    requestAnimationFrame((ts) => this.loop(ts));
  }

  spawnStarterPickups() {
    const L = this.city.landmarks;
    this.combat.dropPickup(L.hospital.x + 30, L.hospital.y + 30, 'health');
    this.combat.dropPickup(L.garage.x + 30, L.garage.y - 30, 'ammo');
    this.combat.dropPickup(L.pier.x, L.pier.y - 20, 'cash');
  }

  allCars() {
    const cars = [];
    if (this.player.inCar) cars.push(this.player.inCar);
    for (const c of this.traffic.cars) if (c !== this.player.inCar) cars.push(c);
    for (const c of this.wanted.copCars) if (c !== this.player.inCar) cars.push(c);
    for (const c of this.missionCars) if (c !== this.player.inCar && !this.traffic.cars.includes(c) && !this.wanted.copCars.includes(c)) cars.push(c);
    return cars;
  }

  screenToWorld(sx, sy) {
    return {
      x: this.camera.x - VIEW_W / 2 + sx,
      y: this.camera.y - VIEW_H / 2 + sy,
    };
  }

  bindScreens() {
    const $ = (id) => document.getElementById(id);
    $('btn-start').addEventListener('click', () => this.startNew());
    $('btn-continue').addEventListener('click', () => this.startContinue());
    $('btn-resume').addEventListener('click', () => this.resume());
    $('btn-restart').addEventListener('click', () => this.startNew());
    $('btn-quit-title').addEventListener('click', () => this.toTitle());
    $('btn-free').addEventListener('click', () => this.freeRoam());
    $('btn-mute').addEventListener('click', () => this.toggleMute());
    $('btn-save').addEventListener('click', () => { this.save(); this.hud.toast('Game saved.', '#7be07b'); });
  }

  showScreen(name) {
    for (const id of ['screen-title', 'screen-pause', 'screen-over', 'screen-win']) {
      document.getElementById(id).style.display = 'none';
    }
    if (name) document.getElementById(`screen-${name}`).style.display = 'flex';
    this.hud.el.hud.style.display = name === null ? 'block' : 'none';
  }

  updateContinueButton() {
    document.getElementById('btn-continue').style.display = hasSave() ? 'block' : 'none';
  }

  startNew() {
    clearSave();
    this.audio.init();
    this.resetRun();
    this.missions.start();
    this.state = 'playing';
    this.showScreen(null);
    this.hud.toast('Welcome to Neon Harbor. Follow the yellow marker.', '#ffd23f');
  }

  startContinue() {
    const data = loadGame();
    this.audio.init();
    this.resetRun();
    if (data) {
      this.money = data.money;
      this.stats = { ...this.stats, ...data.stats };
      this.player.x = data.player.x;
      this.player.y = data.player.y;
      this.player.hp = data.player.hp;
      this.player.ammo = data.player.ammo;
      this.audio.setMuted(!!data.muted);
      this.missions.index = data.missionIndex;
      this.missions.started = true;
      this.missions.beginMission(data.missionIndex);
      this.camera.x = this.player.x;
      this.camera.y = this.player.y;
    }
    this.state = 'playing';
    this.showScreen(null);
    this.hud.toast('Welcome back to Neon Harbor.', '#ffd23f');
  }

  resetRun() {
    this.player = new Player(this.city.landmarks.safehouse.x + 40, this.city.landmarks.safehouse.y + 40);
    this.traffic = new TrafficManager(this.city, this.rng);
    this.wanted = new WantedSystem(this);
    this.combat = new Combat(this);
    this.missions = new MissionEngine(this);
    this.missionCars = [];
    this.money = 150;
    this.stats = { shotsFired: 0, carsStolen: 0, pedsHit: 0, copsDown: 0, missionsDone: 0, timePlayed: 0 };
    this.time = 0;
    this.camera.x = this.player.x;
    this.camera.y = this.player.y;
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.showScreen('pause');
    this.save();
  }

  resume() {
    this.state = 'playing';
    this.showScreen(null);
  }

  toTitle() {
    this.state = 'title';
    this.save();
    this.showScreen('title');
    this.updateContinueButton();
  }

  toggleMute() {
    this.audio.setMuted(!this.audio.muted);
    document.getElementById('btn-mute').textContent = this.audio.muted ? '🔇 Sound: Off' : '🔊 Sound: On';
  }

  save() { saveGame(this); }

  busted() {
    const lost = Math.floor(this.money * BUSTED_LOSS);
    this.money -= lost;
    this.wanted.clear();
    this.player.inCar = null;
    this.player.x = this.city.landmarks.safehouse.x + 40;
    this.player.y = this.city.landmarks.safehouse.y + 40;
    this.player.hp = this.player.maxHp;
    this.player.dead = false;
    this.camera.x = this.player.x;
    this.camera.y = this.player.y;
    this.state = 'busted';
    document.getElementById('over-title').textContent = 'BUSTED';
    document.getElementById('over-text').textContent = `The harbor police caught you. You lost $${lost} in fines.`;
    this.showScreen('over');
    this.audio.fail();
    this.save();
  }

  wasted() {
    const lost = Math.floor(this.money * BUSTED_LOSS);
    this.money -= lost;
    this.wanted.clear();
    this.player.inCar = null;
    this.player.x = this.city.landmarks.hospital.x + 40;
    this.player.y = this.city.landmarks.hospital.y + 40;
    this.player.hp = this.player.maxHp;
    this.player.dead = false;
    this.camera.x = this.player.x;
    this.camera.y = this.player.y;
    this.state = 'wasted';
    document.getElementById('over-title').textContent = 'WASTED';
    document.getElementById('over-text').textContent = `You woke up at the hospital. The bill cost you $${lost}.`;
    this.showScreen('over');
    this.audio.fail();
    this.save();
  }

  onStoryComplete() {
    this.state = 'won';
    document.getElementById('win-stats').textContent =
      `Missions: ${this.stats.missionsDone}/5  •  Money: $${this.money.toLocaleString('en-US')}  •  Cars stolen: ${this.stats.carsStolen}  •  Time: ${Math.floor(this.stats.timePlayed / 60)}m`;
    this.showScreen('win');
    this.audio.jingle();
  }

  freeRoam() {
    this.state = 'playing';
    this.showScreen(null);
    this.hud.toast('Free roam — Neon Harbor is yours.', '#7be07b');
  }

  update(dt) {
    this.time += dt;
    this.clock += dt * 30;
    this.stats.timePlayed += dt;
    const p = this.player;
    const input = this.input;

    // Global keys (pause lives in the loop so it works from the paused screen).
    this.eConsumedByDialogue = false;
    if (this.input.wasPressed('m')) this.toggleMute();
    if (this.input.wasPressed('e') && this.hud.dialogueLines.length) {
      this.hud.advanceDialogue();
      this.eConsumedByDialogue = true; // one E press dismisses dialogue, it never also enters a car
    }

    // Driving.
    if (p.inCar && !p.dead) {
      const car = p.inCar;
      const throttle = input.down('w', 'arrowup') ? 1 : input.down('s', 'arrowdown') ? -1 : 0;
      const steer = input.down('a', 'arrowleft') ? -1 : input.down('d', 'arrowright') ? 1 : 0;
      const handbrake = input.down(' ');
      car.drive(dt, throttle, steer, handbrake);
      this.audio.setEngine(Math.abs(car.speed) / 460, true);
      // Garage repair: press R near the garage while damaged.
      if (input.wasPressed('r')) {
        const g = this.city.landmarks.garage;
        const d = Math.hypot(car.x - g.x, car.y - g.y);
        if (d < 130 && car.hp < car.maxHp && this.money >= 80) {
          this.money -= 80;
          car.repair();
          this.hud.toast('Car repaired — $80', '#7be07b');
          this.audio.pickup();
        }
      }
    } else {
      this.audio.setEngine(0, false);
    }

    p.update(dt, input, this);
    this.traffic.update(dt, this);
    this.wanted.update(dt);
    this.combat.update(dt);
    this.missions.update(dt);

    // Mission cars that are not the player's: keep the van driving (in missions).
    // Pickups respawn over time at the hospital and garage.
    this.pickupTimer += dt;
    if (this.pickupTimer > 25) {
      this.pickupTimer = 0;
      const L = this.city.landmarks;
      if (this.combat.pickups.filter((k) => k.kind === 'health').length < 2) this.combat.dropPickup(L.hospital.x + 30, L.hospital.y + 30, 'health');
      if (this.combat.pickups.filter((k) => k.kind === 'ammo').length < 2) this.combat.dropPickup(L.garage.x + 30, L.garage.y - 30, 'ammo');
    }

    // Camera follows the player with a little look-ahead and shake.
    const tx = p.x + Math.cos(p.angle) * 40;
    const ty = p.y + Math.sin(p.angle) * 40;
    this.camera.x += (tx - this.camera.x) * CAM_SMOOTH;
    this.camera.y += (ty - this.camera.y) * CAM_SMOOTH;
    this.camera.x = clamp(this.camera.x, VIEW_W / 2 - 100, this.city.size - VIEW_W / 2 + 100);
    this.camera.y = clamp(this.camera.y, VIEW_H / 2 - 100, this.city.size - VIEW_H / 2 + 100);

    // Wasted check.
    if (p.dead && this.state === 'playing') this.wasted();

    // Autosave.
    if (this.time - this.lastSave > 30) {
      this.lastSave = this.time;
      this.save();
    }

    this.hud.update(this);
    this.input.endFrame();
  }

  loop(ts) {
    const dt = Math.min(0.05, (ts - this.lastTs) / 1000 || 0.016);
    this.lastTs = ts;
    // Pause / resume works from either state, so it lives in the loop, not update.
    if (!this.shotMode && this.input.wasPressed('p', 'escape')) {
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused') this.resume();
    }
    if (this.shotMode && !this.shotDone) {
      // Fixed-step staging: run the live game, then signal the screenshot.
      this.update(dt);
      autopilotStep(this, dt);
      this.shotFrames += 1;
      if (this.shotFrames >= 150) {
        this.shotDone = true;
        window.__shotReady = true;
      }
    } else if (this.state === 'playing') {
      this.update(dt);
    } else if (this.state === 'title') {
      // A slow pan across the city behind the title screen.
      this.time += dt;
      this.camera.x = 1300 + Math.cos(this.time * 0.05) * 500;
      this.camera.y = 1300 + Math.sin(this.time * 0.05) * 400;
    }
    this.input.endFrame(); // clear edge-triggered keys every frame, in every state
    // Draw the world in every state so the title screen has a live backdrop.
    const ctx = this.ctx;
    ctx.save();
    if (this.combat.shake > 0) {
      ctx.translate((Math.random() - 0.5) * this.combat.shake, (Math.random() - 0.5) * this.combat.shake);
    }
    drawWorld(ctx, this);
    ctx.restore();
    requestAnimationFrame((t) => this.loop(t));
  }
}

// Boot: fixed 1280x720 backing store (CSS scales it to the window), so the game
// always renders at the screenshot resolution.
const canvas = document.getElementById('game');
canvas.width = 1280;
canvas.height = 720;
new Game(canvas);
