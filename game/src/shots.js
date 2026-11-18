// Screenshot scenes behind ?shot=cover|foot|chase|mission. Each one stages a real
// moment of the game — the player driving, on foot, in a police chase, mid-mission
// — then the live game runs forward with a simple autopilot, so the frame is what
// a short stretch of real play looks like, from the same seed every time.
import { ROAD_LINES } from './config.js';
import { Car } from './vehicles.js';

export const SHOT_NAMES = ['cover', 'foot', 'chase', 'mission'];

// Put the player in a car on a road, driving east at speed.
function putPlayerInCar(game, x, y, angle, color, kind) {
  const car = new Car(x, y, angle, { color: color || '#c0392b', kind: kind || 'sports', owner: 'player', topSpeed: 460 });
  car.speed = 300;
  game.missionCars.push(car);
  game.player.inCar = car;
  game.player.x = x;
  game.player.y = y;
  game.player.angle = angle;
  game.camera.x = x;
  game.camera.y = y;
  return car;
}

export function stageShot(game, name) {
  const p = game.player;
  const city = game.city;
  const L = city.landmarks;
  game.missions.started = true;
  if (name === 'cover') {
    // Driving through downtown with the HUD and minimap live, mission 1 active.
    game.missions.index = 0;
    game.missions.stepIndex = 2;
    game.missions.applyStepSetup();
    putPlayerInCar(game, ROAD_LINES[2], ROAD_LINES[3], 0, '#c0392b', 'sports');
    // A little traffic around the player.
    for (let i = 0; i < 4; i += 1) {
      const c = new Car(ROAD_LINES[2] + 180 + i * 160, ROAD_LINES[3] + (i % 2 ? 18 : -18), 0, { color: ['#2980b9', '#f2c230', '#7f8c8d', '#16a085'][i], owner: 'traffic', topSpeed: 140 });
      c.speed = 130;
      game.traffic.cars.push(c);
    }
  } else if (name === 'foot') {
    // On foot near the docks, pedestrians and traffic, mission 2 active.
    game.missions.index = 1;
    game.missions.stepIndex = 0;
    game.missions.applyStepSetup();
    p.x = L.dock.x - 260;
    p.y = L.dock.y - 120;
    p.angle = Math.PI / 4;
    game.camera.x = p.x;
    game.camera.y = p.y;
    for (let i = 0; i < 5; i += 1) {
      const ped = game.traffic.makePed(p.x + (i - 2) * 60, p.y + 40 + (i % 2) * 50);
      game.traffic.peds.push(ped);
    }
    const c = new Car(ROAD_LINES[5], L.dock.y - 130, 0, { color: '#2980b9', owner: 'traffic', topSpeed: 140 });
    c.speed = 130;
    game.traffic.cars.push(c);
  } else if (name === 'chase') {
    // A 3-star chase: two patrol cars on the player's tail, sirens wailing.
    game.missions.index = 2;
    game.missions.stepIndex = 3;
    game.missions.applyStepSetup();
    putPlayerInCar(game, ROAD_LINES[3], ROAD_LINES[4], 0, '#8e44ad', 'sports');
    game.player.inCar.speed = 380;
    game.wanted.setHeat(55);
    for (let i = 0; i < 2; i += 1) {
      const cop = new Car(ROAD_LINES[3] - 180 - i * 90, ROAD_LINES[4] + (i ? 20 : -20), 0, { color: '#1d3f8f', kind: 'cop', owner: 'police', topSpeed: 400 });
      cop.speed = 360;
      game.wanted.copCars.push(cop);
    }
    game.wanted.footCops.push({ x: ROAD_LINES[3] + 300, y: ROAD_LINES[4] + 60, angle: 0, shootTimer: 0, punchTimer: 0, walkPhase: 0 });
  } else if (name === 'mission') {
    // Mission 3 in progress: hot cargo aboard, the bank drop-off marked ahead.
    game.missions.index = 2;
    game.missions.stepIndex = 3;
    game.missions.applyStepSetup();
    putPlayerInCar(game, 1800, 1700, Math.atan2(L.bank.y - 1700, L.bank.x - 1800), '#e67e22', 'sedan');
    game.player.inCar.speed = 260;
    game.wanted.setHeat(30);
  }
  game.state = 'playing';
  game.hud.el.hud.style.display = 'block';
}

// A simple driver for screenshot scenes: keep the car on the road, throttle on,
// steer toward the road ahead. On foot, walk toward the mission marker.
export function autopilotStep(game, dt) {
  const p = game.player;
  if (p.inCar) {
    const car = p.inCar;
    // Steer toward a point ahead on the current road line.
    const aheadX = car.x + Math.cos(car.angle) * 220;
    const aheadY = car.y + Math.sin(car.angle) * 220;
    const target = nearestRoadPointAhead(game, aheadX, aheadY);
    car.steerToward(target.x, target.y);
    car.drive(dt, 1, car.steer, false);
    return;
  }
  const marker = game.missions.marker();
  if (marker) {
    const d = Math.hypot(marker.x - p.x, marker.y - p.y);
    if (d > 60) {
      const a = Math.atan2(marker.y - p.y, marker.x - p.x);
      p.x += Math.cos(a) * 175 * dt;
      p.y += Math.sin(a) * 175 * dt;
      p.angle = a;
      p.walkPhase += dt * 9;
      p.moving = true;
    }
  }
}

function nearestRoadPointAhead(game, x, y) {
  // Find the closest road line point ahead of the car.
  let best = null;
  let bestD = Infinity;
  for (const line of ROAD_LINES) {
    const d1 = Math.abs(x - line);
    if (d1 < bestD) { bestD = d1; best = { x: line, y }; }
  }
  bestD = Infinity;
  for (const line of ROAD_LINES) {
    const d2 = Math.abs(y - line);
    if (d2 < bestD) { bestD = d2; best = { x, y: line }; }
  }
  return best;
}
