// The wanted system: heat from crimes, stars from heat, and the police who
// answer — foot cops who chase and bust, and patrol cars that ram and shoot.
import { STAR_THRESHOLDS, WANTED_DECAY, WANTED_CRIME_WINDOW, COP_FOOT_SPEED, COP_SHOT_DAMAGE, COP_SHOT_RATE, COP_CAR_SPEED, BUST_TIME, HEAT_HIT_PED, HEAT_KILL_PED, HEAT_SHOOT_COP, HEAT_KILL_COP, HEAT_RAM_COP, HEAT_SHOOTING } from './config.js';
import { clamp, angleDiff } from './random.js';
import { randomRoadPoint, collideBuildings, clampToLand } from './world.js';
import { Car } from './vehicles.js';

export class WantedSystem {
  constructor(game) {
    this.game = game;
    this.heat = 0;
    this.stars = 0;
    this.lastCrimeAt = -100;
    this.footCops = [];
    this.copCars = [];
    this.bustTimer = 0;
    this.shootTimer = 0;
  }

  addHeat(amount, kind) {
    const g = this.game;
    this.heat = clamp(this.heat + amount, 0, 100);
    this.lastCrimeAt = g.time;
    if (kind === 'killPed') g.stats.pedsHit += 1;
    if (kind === 'killCop') g.stats.copsDown += 1;
    this.updateStars();
  }

  setHeat(value) {
    this.heat = clamp(value, 0, 100);
    this.lastCrimeAt = this.game.time;
    this.updateStars();
  }

  updateStars() {
    let s = 0;
    for (let i = 0; i < STAR_THRESHOLDS.length; i += 1) {
      if (this.heat >= STAR_THRESHOLDS[i]) s = i + 1;
    }
    if (s !== this.stars) {
      this.stars = s;
      if (s > 0) this.game.hud.toast(s >= 3 ? 'WANTED — the whole harbor is after you!' : 'Wanted level up!', '#ff5a4e');
    }
  }

  update(dt) {
    const g = this.game;
    // Heat cools off when the player has been quiet for a while.
    if (g.time - this.lastCrimeAt > WANTED_CRIME_WINDOW && this.heat > 0) {
      this.heat = Math.max(0, this.heat - WANTED_DECAY * dt);
      this.updateStars();
    }
    this.game.audio.setSiren(this.stars > 0);

    // --- maintain the police presence for the current stars ---
    const wantFoot = this.stars >= 1 ? Math.min(this.stars, 3) : 0;
    const wantCars = this.stars >= 2 ? Math.min(this.stars - 1, 3) : 0;
    while (this.footCops.length < wantFoot) this.spawnFootCop();
    while (this.copCars.length < wantCars) this.spawnCopCar();
    // Despawn cops far away once the heat is gone.
    if (this.stars === 0) {
      this.footCops = this.footCops.filter((c) => Math.hypot(c.x - g.player.x, c.y - g.player.y) < 500);
      this.copCars = this.copCars.filter((c) => !c.dead && Math.hypot(c.x - g.player.x, c.y - g.player.y) < 900);
    }

    // --- foot cops: chase, punch, shoot, bust ---
    const p = g.player;
    let touching = false;
    for (const cop of this.footCops) {
      cop.shootTimer = Math.max(0, (cop.shootTimer || 0) - dt);
      const d = Math.hypot(p.x - cop.x, p.y - cop.y);
      if (p.dead || p.inCar) {
        // The player is in a car: cops shoot at the car.
        if (p.inCar && d < 420 && cop.shootTimer <= 0) {
          cop.shootTimer = COP_SHOT_RATE;
          g.combat.fireBullet(cop.x, cop.y, Math.atan2(p.y - cop.y, p.x - cop.x), 620, COP_SHOT_DAMAGE, 460, 'cop');
          g.audio.gunshot();
        }
        // Still run toward the car to keep up.
        cop.angle = Math.atan2(p.y - cop.y, p.x - cop.x);
        this.moveCop(cop, dt, COP_FOOT_SPEED * 0.9);
        continue;
      }
      if (d < 30) {
        touching = true;
        cop.punchTimer = (cop.punchTimer || 0) - dt;
        if (cop.punchTimer <= 0) {
          cop.punchTimer = 0.8;
          p.damage(9);
          g.hud.flashDamage();
          g.audio.blip(180, 0.1, 'square', 0.2);
        }
      } else {
        cop.angle = Math.atan2(p.y - cop.y, p.x - cop.x);
        this.moveCop(cop, dt, COP_FOOT_SPEED);
        if (d < 380 && cop.shootTimer <= 0) {
          cop.shootTimer = COP_SHOT_RATE;
          g.combat.fireBullet(cop.x, cop.y, Math.atan2(p.y - cop.y, p.x - cop.x) + (Math.random() - 0.5) * 0.55, 620, COP_SHOT_DAMAGE, 420, 'cop');
        }
      }
    }
    this.bustTimer = touching ? this.bustTimer + dt : 0;
    if (this.bustTimer > BUST_TIME) {
      this.bustTimer = 0;
      g.busted();
    }

    // --- cop cars: ram the player's car, or chase on foot ---
    for (const car of this.copCars) {
      if (car.dead) continue;
      const tx = p.inCar ? p.inCar.x : p.x;
      const ty = p.inCar ? p.inCar.y : p.y;
      const diff = car.steerToward(tx, ty);
      const throttle = Math.abs(diff) > 1.4 ? 0.3 : 1;
      car.drive(dt, throttle, car.steer, false);
      car.speed = Math.min(car.speed, COP_CAR_SPEED);
      // Ramming the player's car damages it and adds heat.
      if (p.inCar) {
        const d = Math.hypot(car.x - p.inCar.x, car.y - p.inCar.y);
        if (d < 46 && Math.abs(car.speed) > 150) {
          p.inCar.damage(6);
          car.damage(4);
          g.audio.crash();
          if (p.inCar.dead) g.combat.explodeCar(p.inCar);
        }
      }
    }
    this.copCars = this.copCars.filter((c) => !c.dead);
  }

  moveCop(cop, dt, speed) {
    const nx = cop.x + Math.cos(cop.angle) * speed * dt;
    const ny = cop.y + Math.sin(cop.angle) * speed * dt;
    const p = collideBuildings(this.game.city, nx, ny, 12);
    const c = clampToLand(this.game.city, p.x, p.y, 12);
    cop.x = c.x;
    cop.y = c.y;
    cop.walkPhase = (cop.walkPhase || 0) + dt * 9;
  }

  spawnFootCop() {
    const g = this.game;
    const p = randomRoadPoint(g.rng);
    // Spawn out of sight but not too far.
    let x = p.x;
    let y = p.y;
    const d = Math.hypot(x - g.player.x, y - g.player.y);
    if (d < 350 || d > 1000) {
      const a = g.rng.range(0, Math.PI * 2);
      x = g.player.x + Math.cos(a) * 650;
      y = g.player.y + Math.sin(a) * 650;
      const c = clampToLand(g.city, x, y, 12);
      x = c.x; y = c.y;
    }
    this.footCops.push({ x, y, angle: 0, shootTimer: 0, punchTimer: 0, walkPhase: 0 });
  }

  spawnCopCar() {
    const g = this.game;
    const p = randomRoadPoint(g.rng);
    const car = new Car(p.x, p.y, p.vertical ? Math.PI / 2 : 0, {
      color: '#1d3f8f', kind: 'cop', owner: 'police', topSpeed: COP_CAR_SPEED,
    });
    car.speed = 200;
    this.copCars.push(car);
  }

  // Called when the player is busted or wasted: clear the heat, clear the cops.
  clear() {
    this.heat = 0;
    this.stars = 0;
    this.footCops = [];
    this.copCars = [];
    this.bustTimer = 0;
  }
}
