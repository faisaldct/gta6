// The HUD: health, money, ammo, wanted stars, the mission objective, the clock
// and a live minimap — DOM for text, a small canvas for the map.
import { ROAD_LINES, ROAD_WIDTH } from './config.js';

export class Hud {
  constructor() {
    this.el = {};
    for (const id of ['hud', 'health-fill', 'health-text', 'money', 'ammo', 'stars', 'speed', 'objective', 'clock', 'toast', 'dialogue', 'dialogue-title', 'dialogue-text', 'damage-flash', 'minimap', 'mission-list']) {
      this.el[id] = document.getElementById(id);
    }
    this.toastTimer = null;
    this.dialogueLines = [];
    this.dialogueIndex = 0;
    this.dialogueTimer = null;
    this.minimap = this.el.minimap.getContext('2d');
  }

  update(game) {
    const p = game.player;
    const hpPct = Math.max(0, Math.round((p.hp / p.maxHp) * 100));
    this.el['health-fill'].style.width = `${hpPct}%`;
    this.el['health-fill'].style.background = hpPct > 50 ? '#4caf50' : hpPct > 25 ? '#ff9800' : '#f44336';
    this.el['health-text'].textContent = `${hpPct}`;
    this.el.money.textContent = `$${game.money.toLocaleString('en-US')}`;
    this.el.ammo.textContent = p.inCar ? '—' : `${p.ammo}`;
    // Wanted stars.
    let stars = '';
    for (let i = 0; i < 5; i += 1) stars += i < game.wanted.stars ? '★' : '☆';
    this.el.stars.textContent = stars;
    this.el.stars.style.color = game.wanted.stars >= 3 ? '#ff5a4e' : '#ffd23f';
    // Speed.
    const speed = p.inCar ? Math.round(Math.abs(p.inCar.speed) * 0.28) : 0;
    this.el.speed.textContent = p.inCar ? `${speed} mph` : '';
    // Objective + clock.
    this.el.objective.textContent = game.missions.objectiveText();
    const hours = Math.floor(game.clock / 3600) % 24;
    const mins = Math.floor((game.clock % 3600) / 60);
    this.el.clock.textContent = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    // Mission list.
    const list = game.missions.missions.map((m, i) => {
      const mark = i < game.missions.index ? '✓' : i === game.missions.index ? '►' : '·';
      return `<div class="mission-row ${i === game.missions.index ? 'active' : ''}">${mark} ${m.title} — $${m.reward}</div>`;
    }).join('');
    this.el['mission-list'].innerHTML = list;
    this.drawMinimap(game);
  }

  drawMinimap(game) {
    const ctx = this.minimap;
    const S = 150;
    const scale = S / game.city.size;
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = '#20301f';
    ctx.fillRect(0, 0, S, S);
    // Roads.
    ctx.fillStyle = '#5a6068';
    for (const line of ROAD_LINES) {
      ctx.fillRect(0, line * scale - (ROAD_WIDTH / 2) * scale, S, ROAD_WIDTH * scale);
      ctx.fillRect(line * scale - (ROAD_WIDTH / 2) * scale, 0, ROAD_WIDTH * scale, S);
    }
    // Water.
    ctx.fillStyle = '#3d8fb5';
    ctx.fillRect(0, game.city.waterY * scale, S, S - game.city.waterY * scale);
    // Mission marker.
    const marker = game.missions.marker();
    if (marker) {
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath(); ctx.arc(marker.x * scale, marker.y * scale, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(marker.x * scale, marker.y * scale, 7, 0, Math.PI * 2); ctx.stroke();
    }
    // Cop cars (blue) and foot cops.
    ctx.fillStyle = '#4d8dff';
    for (const car of game.wanted.copCars) {
      ctx.fillRect(car.x * scale - 2, car.y * scale - 2, 4, 4);
    }
    for (const cop of game.wanted.footCops) {
      ctx.fillRect(cop.x * scale - 1.5, cop.y * scale - 1.5, 3, 3);
    }
    // Traffic (grey dots).
    ctx.fillStyle = 'rgba(200,200,200,0.7)';
    for (const car of game.traffic.cars) {
      ctx.fillRect(car.x * scale - 1, car.y * scale - 1, 2, 2);
    }
    // Player (yellow, with a white ring).
    const p = game.player;
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath(); ctx.arc(p.x * scale, p.y * scale, 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(p.x * scale, p.y * scale, 6, 0, Math.PI * 2); ctx.stroke();
    // View rectangle.
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    const cam = game.camera;
    ctx.strokeRect((cam.x - 640) * scale, (cam.y - 360) * scale, 1280 * scale, 720 * scale);
  }

  toast(msg, color) {
    const t = this.el.toast;
    t.textContent = msg;
    t.style.color = color || '#ffffff';
    t.style.opacity = '1';
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { t.style.opacity = '0'; }, 3200);
  }

  dialogue(lines, title) {
    if (this.shotMode) return; // screenshots must never show a dialogue box
    this.dialogueLines = lines;
    this.dialogueIndex = 0;
    this.el['dialogue-title'].textContent = title || '';
    this.showDialogueLine();
    this.el.dialogue.style.display = 'block';
    this.scheduleDialogueAdvance();
  }

  showDialogueLine() {
    this.el['dialogue-text'].textContent = this.dialogueLines[this.dialogueIndex] || '';
  }

  scheduleDialogueAdvance() {
    if (this.dialogueTimer) clearTimeout(this.dialogueTimer);
    this.dialogueTimer = setTimeout(() => this.advanceDialogue(), 3500);
  }

  advanceDialogue() {
    this.dialogueIndex += 1;
    if (this.dialogueIndex >= this.dialogueLines.length) {
      this.el.dialogue.style.display = 'none';
      this.dialogueLines = [];
      return;
    }
    this.showDialogueLine();
    this.scheduleDialogueAdvance();
  }

  flashDamage() {
    const f = this.el['damage-flash'];
    f.style.opacity = '0.45';
    setTimeout(() => { f.style.opacity = '0'; }, 120);
  }
}
