// Canvas rendering: the city, the cars, the people, the effects. Everything is
// drawn as vector shapes on one canvas — no image assets, no network.
import { ROAD_WIDTH, ROAD_LINES, PALETTE, VIEW_W, VIEW_H } from './config.js';

export function drawWorld(ctx, game) {
  const cam = game.camera;
  const vw = VIEW_W;
  const vh = VIEW_H;
  const ox = cam.x - vw / 2;
  const oy = cam.y - vh / 2;
  const city = game.city;

  // --- ground ---
  ctx.fillStyle = PALETTE.grass;
  ctx.fillRect(0, 0, vw, vh);
  // Beach and bay along the south edge.
  const beachY = city.beachY - oy;
  const waterY = city.waterY - oy;
  if (beachY < vh) {
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(0, Math.max(0, beachY), vw, vh - Math.max(0, beachY));
  }
  if (waterY < vh) {
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(0, Math.max(0, waterY), vw, vh - Math.max(0, waterY));
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i += 1) {
      const wy = waterY + 24 + i * 26;
      if (wy > 0 && wy < vh) {
        ctx.beginPath();
        for (let x = 0; x <= vw; x += 40) ctx.lineTo(x, wy + Math.sin(x * 0.02 + game.time * 1.5 + i) * 3);
        ctx.stroke();
      }
    }
  }

  // --- sidewalks (blocks) ---
  ctx.fillStyle = PALETTE.sidewalk;
  for (let i = 0; i < ROAD_LINES.length - 1; i += 1) {
    for (let j = 0; j < ROAD_LINES.length - 1; j += 1) {
      const x0 = ROAD_LINES[i] + ROAD_WIDTH / 2;
      const y0 = ROAD_LINES[j] + ROAD_WIDTH / 2;
      const w = ROAD_LINES[i + 1] - ROAD_LINES[i] - ROAD_WIDTH;
      const h = ROAD_LINES[j + 1] - ROAD_LINES[j] - ROAD_WIDTH;
      ctx.fillRect(x0 - ox, y0 - oy, w, h);
    }
  }
  // Central park.
  const parkX0 = ROAD_LINES[3] + ROAD_WIDTH / 2;
  const parkY0 = ROAD_LINES[3] + ROAD_WIDTH / 2;
  const parkW = ROAD_LINES[4] - ROAD_LINES[3] - ROAD_WIDTH;
  const parkH = ROAD_LINES[4] - ROAD_LINES[3] - ROAD_WIDTH;
  ctx.fillStyle = PALETTE.park;
  ctx.fillRect(parkX0 - ox, parkY0 - oy, parkW, parkH);

  // --- roads ---
  ctx.fillStyle = PALETTE.road;
  for (const line of ROAD_LINES) {
    ctx.fillRect(0, line - ROAD_WIDTH / 2 - oy, vw, ROAD_WIDTH);
    ctx.fillRect(line - ROAD_WIDTH / 2 - ox, 0, ROAD_WIDTH, vh);
  }
  // Centre dashes.
  ctx.strokeStyle = PALETTE.roadLine;
  ctx.lineWidth = 3;
  ctx.setLineDash([18, 22]);
  for (const line of ROAD_LINES) {
    ctx.beginPath(); ctx.moveTo(0, line - oy); ctx.lineTo(vw, line - oy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(line - ox, 0); ctx.lineTo(line - ox, vh); ctx.stroke();
  }
  ctx.setLineDash([]);
  // Crosswalks at intersections.
  ctx.fillStyle = PALETTE.crosswalk;
  for (const lx of ROAD_LINES) {
    for (const ly of ROAD_LINES) {
      const x = lx - ox;
      const y = ly - oy;
      if (x < -60 || x > vw + 60 || y < -60 || y > vh + 60) continue;
      for (let i = -3; i <= 3; i += 1) {
        ctx.fillRect(x - 30 + i * 9, y - ROAD_WIDTH / 2 - 4, 5, 10);
        ctx.fillRect(x - 30 + i * 9, y + ROAD_WIDTH / 2 - 6, 5, 10);
      }
    }
  }

  // --- buildings (shadow + roof) ---
  for (const b of city.buildings) {
    const x = b.x - ox;
    const y = b.y - oy;
    if (x > vw + 40 || y > vh + 40 || x + b.w < -40 || y + b.h < -40) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x + 6, y + 8, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(x, y, b.w, b.h);
    ctx.strokeStyle = PALETTE.buildingEdge;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, b.w, b.h);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    if (b.roof === 'peak') {
      ctx.beginPath();
      ctx.moveTo(x, y + b.h);
      ctx.lineTo(x + b.w / 2, y + 8);
      ctx.lineTo(x + b.w, y + b.h);
      ctx.closePath();
      ctx.fill();
    } else if (b.roof === 'garden') {
      ctx.fillStyle = '#5f9e52';
      ctx.fillRect(x + 8, y + 8, b.w - 16, b.h - 16);
    } else {
      ctx.fillRect(x + 8, y + 8, b.w - 16, 10);
      ctx.fillRect(x + 8, y + b.h - 18, b.w - 16, 10);
    }
  }

  // --- props ---
  for (const pr of city.props) {
    const x = pr.x - ox;
    const y = pr.y - oy;
    if (x < -30 || x > vw + 30 || y < -30 || y > vh + 30) continue;
    if (pr.kind === 'tree') {
      ctx.fillStyle = PALETTE.treeTrunk;
      ctx.fillRect(x - 2, y - 2, 4, 8);
      ctx.fillStyle = PALETTE.tree;
      ctx.beginPath(); ctx.arc(x, y - 6, 11, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.beginPath(); ctx.arc(x - 3, y - 9, 4, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = PALETTE.lamp;
      ctx.fillRect(x - 1, y - 10, 2, 12);
      ctx.fillStyle = '#ffe9a8';
      ctx.beginPath(); ctx.arc(x, y - 11, 3, 0, Math.PI * 2); ctx.fill();
    }
  }

  // --- lighthouse + pier ---
  const lh = city.landmarks.lighthouse;
  ctx.fillStyle = '#e8e4da';
  ctx.fillRect(lh.x - 8 - ox, lh.y - 34 - oy, 16, 34);
  ctx.fillStyle = '#c0392b';
  ctx.fillRect(lh.x - 8 - ox, lh.y - 34 - oy, 16, 8);
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath(); ctx.arc(lh.x - ox, lh.y - 38 - oy, 5, 0, Math.PI * 2); ctx.fill();

  // --- pickups ---
  for (const pk of game.combat.pickups) {
    const x = pk.x - ox;
    const y = pk.y - oy + Math.sin(pk.bob) * 3;
    if (x < -20 || x > vw + 20 || y < -20 || y > vh + 20) continue;
    ctx.save();
    ctx.translate(x, y);
    if (pk.kind === 'health') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-9, -9, 18, 18);
      ctx.fillStyle = '#e63946';
      ctx.fillRect(-2, -7, 4, 14);
      ctx.fillRect(-7, -2, 14, 4);
    } else if (pk.kind === 'ammo') {
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(-7, -4, 14, 8);
      ctx.fillStyle = '#7a5c00';
      ctx.fillRect(4, -4, 4, 8);
    } else {
      ctx.fillStyle = '#2ecc71';
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', 0, 1);
    }
    ctx.restore();
  }

  // --- mission marker ---
  const marker = game.missions.marker();
  if (marker) {
    const mx = marker.x - ox;
    const my = marker.y - oy;
    const pulse = 1 + Math.sin(game.time * 4) * 0.15;
    if (mx > 0 && mx < vw && my > 0 && my < vh) {
      ctx.strokeStyle = PALETTE.markerRing;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(mx, my, 26 * pulse, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = PALETTE.marker;
      ctx.beginPath(); ctx.arc(mx, my, 8 * pulse, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = PALETTE.marker;
      ctx.beginPath();
      ctx.moveTo(mx, my - 34);
      ctx.lineTo(mx - 8, my - 18);
      ctx.lineTo(mx + 8, my - 18);
      ctx.closePath();
      ctx.fill();
    } else {
      // Off-screen: an arrow at the screen edge points the way.
      const cx = vw / 2;
      const cy = vh / 2;
      const a = Math.atan2(my - cy, mx - cx);
      const ex = cx + Math.cos(a) * (vw / 2 - 30);
      const ey = cy + Math.sin(a) * (vh / 2 - 30);
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(a);
      ctx.fillStyle = PALETTE.marker;
      ctx.beginPath();
      ctx.moveTo(16, 0); ctx.lineTo(-10, -11); ctx.lineTo(-10, 11);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  // --- cars ---
  for (const car of game.allCars()) drawCar(ctx, car, ox, oy, game);

  // --- pedestrians ---
  for (const ped of game.traffic.peds) {
    const x = ped.x - ox;
    const y = ped.y - oy;
    if (x < -20 || x > vw + 20 || y < -20 || y > vh + 20) continue;
    drawPerson(ctx, x, y, ped.angle, ped.shirt, ped.skin, ped.walkPhase, ped.panic > 0);
  }

  // --- foot cops ---
  for (const cop of game.wanted.footCops) {
    const x = cop.x - ox;
    const y = cop.y - oy;
    if (x < -20 || x > vw + 20 || y < -20 || y > vh + 20) continue;
    drawPerson(ctx, x, y, cop.angle, '#1d3f8f', '#f1c27d', cop.walkPhase || 0, false, true);
  }

  // --- player ---
  const p = game.player;
  if (!p.dead) {
    if (p.inCar) {
      // Player is in the car; the car is drawn above.
    } else {
      const x = p.x - ox;
      const y = p.y - oy;
      drawPerson(ctx, x, y, p.angle, PALETTE.playerShirt, '#f1c27d', p.walkPhase, false, false, true);
    }
  }

  // --- bullets ---
  ctx.strokeStyle = '#fff2a8';
  ctx.lineWidth = 2;
  for (const b of game.combat.bullets) {
    ctx.beginPath();
    ctx.moveTo(b.x - ox, b.y - oy);
    ctx.lineTo(b.x - ox - b.vx * 0.02, b.y - oy - b.vy * 0.02);
    ctx.stroke();
  }

  // --- particles ---
  for (const pt of game.combat.particles) {
    ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
    ctx.fillStyle = pt.color;
    ctx.beginPath(); ctx.arc(pt.x - ox, pt.y - oy, pt.size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // --- sun vignette ---
  const grad = ctx.createRadialGradient(vw / 2, vh / 2, vh * 0.45, vw / 2, vh / 2, vh * 0.95);
  grad.addColorStop(0, 'rgba(255,190,80,0)');
  grad.addColorStop(1, 'rgba(255,170,60,0.12)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, vw, vh);
}

function drawCar(ctx, car, ox, oy, game) {
  const x = car.x - ox;
  const y = car.y - oy;
  const vw = VIEW_W;
  const vh = VIEW_H;
  if (x < -80 || x > vw + 80 || y < -80 || y > vh + 80) return;
  ctx.save();
  ctx.translate(x, y);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(-car.length / 2 + 4, -car.width / 2 + 5, car.length, car.width);
  ctx.rotate(car.angle);
  const halfL = car.length / 2;
  const halfW = car.width / 2;
  // Body.
  ctx.fillStyle = car.dead ? '#3a3a3a' : car.color;
  roundRect(ctx, -halfL, -halfW, car.length, car.width, 7);
  ctx.fill();
  // Roof / cabin.
  ctx.fillStyle = car.dead ? '#2a2a2a' : 'rgba(20,30,45,0.85)';
  roundRect(ctx, -halfL * 0.45, -halfW * 0.78, car.length * 0.5, car.width * 1.56, 4);
  ctx.fill();
  // Windshield + headlights.
  ctx.fillStyle = 'rgba(180,220,240,0.7)';
  ctx.fillRect(halfL * 0.42, -halfW * 0.7, 3, car.width * 1.4);
  ctx.fillStyle = '#fff8c0';
  ctx.fillRect(halfL - 2, -halfW + 3, 3, 5);
  ctx.fillRect(halfL - 2, halfW - 8, 3, 5);
  // Kind markings.
  if (car.kind === 'taxi') {
    ctx.fillStyle = '#111111';
    for (let i = 0; i < 5; i += 1) ctx.fillRect(-halfL + 4 + i * 8, -3, 4, 6);
    ctx.fillStyle = '#f2c230';
    ctx.fillRect(-6, -halfW - 2, 12, 4);
  }
  if (car.kind === 'cop') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-halfL * 0.45, -halfW * 0.78, car.length * 0.5, 6);
    // Flashing light bar.
    const flash = Math.floor(game.time * 6) % 2 === 0;
    ctx.fillStyle = flash ? '#ff2e2e' : '#2e6bff';
    ctx.fillRect(-4, -halfW - 3, 8, 6);
    ctx.fillStyle = flash ? '#2e6bff' : '#ff2e2e';
    ctx.fillRect(4, -halfW - 3, 8, 6);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('HPD', 0, 2);
  }
  if (car.kind === 'van') {
    ctx.fillStyle = 'rgba(20,30,45,0.85)';
    ctx.fillRect(-halfL + 4, -halfW + 4, car.length - 14, car.width - 8);
    ctx.fillStyle = '#c0392b';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('COURIER', 0, 3);
  }
  // Damage smoke.
  if (car.smoke > 0.2) {
    ctx.fillStyle = 'rgba(120,120,120,0.6)';
    ctx.beginPath(); ctx.arc(-halfL + 6, 0, 6 + Math.random() * 4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawPerson(ctx, x, y, angle, shirt, skin, phase, panicking, isCop, isPlayer) {
  ctx.save();
  ctx.translate(x, y);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(1, 3, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
  const bob = Math.sin(phase) * (panicking ? 2.5 : 1.2);
  ctx.rotate(angle);
  // Legs (two feet stepping).
  ctx.fillStyle = '#2c2c34';
  ctx.fillRect(-4, -6 + bob, 5, 4);
  ctx.fillRect(-4, 2 - bob, 5, 4);
  // Body.
  ctx.fillStyle = shirt;
  ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
  // Head.
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(6, 0, 6, 0, Math.PI * 2); ctx.fill();
  // Gun in hand when aiming.
  if (isPlayer) {
    ctx.fillStyle = '#222222';
    ctx.fillRect(8, -2, 12, 3);
  }
  if (isCop) {
    ctx.fillStyle = '#0f2a66';
    ctx.beginPath(); ctx.arc(6, 0, 6.5, Math.PI, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
