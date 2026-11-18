// Traffic cars that drive the road network and pedestrians who walk the
// sidewalks, panic and flee when shots ring out or a car bears down on them.
import { ROAD_LINES, ROAD_WIDTH, TRAFFIC_COUNT, TRAFFIC_SPEED_MIN, TRAFFIC_SPEED_MAX, PED_COUNT, PED_SPEED_MIN, PED_SPEED_MAX, PALETTE } from './config.js';
import { makeRng, clamp } from './random.js';
import { randomRoadPoint, randomSidewalkPoint, collideBuildings, clampToLand, isOnRoad } from './world.js';
import { Car } from './vehicles.js';

const TRAFFIC_COLORS = ['#c0392b', '#2980b9', '#7f8c8d', '#e67e22', '#16a085', '#8e44ad', '#f2c230', '#ecf0f1', '#2c3e50'];
const PED_SHIRTS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#fd79a8'];

export class TrafficManager {
  constructor(city, rng) {
    this.city = city;
    this.rng = rng;
    this.cars = [];
    this.peds = [];
    this.spawnCars();
    this.spawnPeds();
  }

  spawnCars() {
    for (let i = 0; i < TRAFFIC_COUNT; i += 1) {
      const p = randomRoadPoint(this.rng);
      const angle = p.vertical ? (this.rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2) : (this.rng.chance(0.5) ? 0 : Math.PI);
      const car = new Car(p.x, p.y, angle, {
        color: this.rng.pick(TRAFFIC_COLORS),
        kind: this.rng.chance(0.12) ? 'taxi' : 'sedan',
        owner: 'traffic',
        topSpeed: this.rng.range(TRAFFIC_SPEED_MIN, TRAFFIC_SPEED_MAX),
      });
      car.speed = car.topSpeed * 0.7;
      car.roadAxis = p.vertical ? 'v' : 'h';
      car.roadLine = p.vertical ? p.x : p.y;
      this.cars.push(car);
    }
  }

  spawnPeds() {
    for (let i = 0; i < PED_COUNT; i += 1) {
      const p = randomSidewalkPoint(this.rng);
      this.peds.push(this.makePed(p.x, p.y));
    }
  }

  makePed(x, y) {
    return {
      x, y,
      angle: this.rng.range(0, Math.PI * 2),
      speed: this.rng.range(PED_SPEED_MIN, PED_SPEED_MAX),
      shirt: this.rng.pick(PED_SHIRTS),
      skin: this.rng.pick(['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac']),
      hp: 30,
      dead: false,
      panic: 0,
      target: null,
      walkPhase: this.rng.range(0, 6),
      wait: 0,
    };
  }

  // A pedestrian near a gunshot or a speeding car panics and runs away.
  scare(x, y, radius) {
    for (const ped of this.peds) {
      if (ped.dead) continue;
      const d = Math.hypot(ped.x - x, ped.y - y);
      if (d < radius) ped.panic = Math.max(ped.panic, 3);
    }
  }

  update(dt, game) {
    // --- traffic cars: follow their road line, turn at intersections ---
    for (const car of this.cars) {
      if (car.dead || car.owner !== 'traffic') continue;
      // At an intersection, sometimes turn onto the crossing road.
      const onCrossX = ROAD_LINES.some((l) => Math.abs(car.x - l) < 6);
      const onCrossY = ROAD_LINES.some((l) => Math.abs(car.y - l) < 6);
      if (onCrossX && onCrossY && this.rng.chance(dt * 0.5)) {
        car.roadAxis = car.roadAxis === 'v' ? 'h' : 'v';
        car.angle = car.roadAxis === 'v' ? (this.rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2) : (this.rng.chance(0.5) ? 0 : Math.PI);
      }
      // Stay glued to the lane: steer toward a point ahead on the lane line.
      const dirV = car.roadAxis === 'v' ? (Math.sin(car.angle) >= 0 ? 1 : -1) : 0;
      const dirH = car.roadAxis === 'h' ? (Math.cos(car.angle) >= 0 ? 1 : -1) : 0;
      const across = car.roadAxis === 'v' ? car.x : car.y;
      const line = ROAD_LINES.reduce((a, b) => (Math.abs(b - across) < Math.abs(a - across) ? b : a), ROAD_LINES[0]);
      const lane = line + (car.roadAxis === 'v' ? (dirV > 0 ? 18 : -18) : (dirH > 0 ? 18 : -18));
      const lookX = car.roadAxis === 'v' ? lane : car.x + dirH * 120;
      const lookY = car.roadAxis === 'v' ? car.y + dirV * 120 : lane;
      const want = Math.atan2(lookY - car.y, lookX - car.x);
      let diff = want - car.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      car.angle += clamp(diff, -1.6 * dt, 1.6 * dt);
      // Slow down for a car ahead on the same road.
      let blocked = false;
      for (const other of game.allCars()) {
        if (other === car || other.dead) continue;
        const dx = other.x - car.x;
        const dy = other.y - car.y;
        const ahead = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
        const side = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
        if (ahead > 0 && ahead < 70 && side < 26) { blocked = true; break; }
      }
      const targetSpeed = blocked ? 0 : car.topSpeed;
      car.speed += clamp(targetSpeed - car.speed, -260 * dt, 180 * dt);
      const nx = car.x + Math.cos(car.angle) * car.speed * dt;
      const ny = car.y + Math.sin(car.angle) * car.speed * dt;
      car.moveTo(nx, ny);
      if (Math.abs(car.speed) < 2) car.speed = 0;
    }
    // Remove the wrecked and the stolen; top the streets back up.
    this.cars = this.cars.filter((c) => !c.dead && c.owner === 'traffic');
    while (this.cars.length < TRAFFIC_COUNT) {
      const p = randomRoadPoint(this.rng);
      const angle = p.vertical ? Math.PI / 2 : 0;
      const car = new Car(p.x, p.y, angle, { color: this.rng.pick(TRAFFIC_COLORS), owner: 'traffic', topSpeed: this.rng.range(TRAFFIC_SPEED_MIN, TRAFFIC_SPEED_MAX) });
      car.speed = car.topSpeed * 0.7;
      car.roadAxis = p.vertical ? 'v' : 'h';
      this.cars.push(car);
    }

    // --- pedestrians ---
    for (const ped of this.peds) {
      if (ped.dead) continue;
      ped.walkPhase += dt * 7;
      if (ped.panic > 0) {
        ped.panic -= dt;
        // Run away from the nearest danger (the player or a fast car).
        const dx = ped.x - game.player.x;
        const dy = ped.y - game.player.y;
        const d = Math.hypot(dx, dy) || 1;
        ped.angle = Math.atan2(dy, dx);
        const sp = ped.speed * 2.6;
        const nx = ped.x + Math.cos(ped.angle) * sp * dt;
        const ny = ped.y + Math.sin(ped.angle) * sp * dt;
        const p = collideBuildings(this.city, nx, ny, 10);
        const c = clampToLand(this.city, p.x, p.y, 10);
        ped.x = c.x; ped.y = c.y;
        continue;
      }
      if (ped.wait > 0) { ped.wait -= dt; continue; }
      if (!ped.target || Math.hypot(ped.target.x - ped.x, ped.target.y - ped.y) < 12) {
        ped.target = randomSidewalkPoint(this.rng);
        if (this.rng.chance(0.2)) ped.wait = this.rng.range(1, 4);
      }
      if (ped.target) {
        ped.angle = Math.atan2(ped.target.y - ped.y, ped.target.x - ped.x);
        const nx = ped.x + Math.cos(ped.angle) * ped.speed * dt;
        const ny = ped.y + Math.sin(ped.angle) * ped.speed * dt;
        const p = collideBuildings(this.city, nx, ny, 10);
        const c = clampToLand(this.city, p.x, p.y, 10);
        ped.x = c.x; ped.y = c.y;
      }
    }
    this.peds = this.peds.filter((p) => !p.dead);
    while (this.peds.length < PED_COUNT) {
      const p = randomSidewalkPoint(this.rng);
      this.peds.push(this.makePed(p.x, p.y));
    }
  }
}
